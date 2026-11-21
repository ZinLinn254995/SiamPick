import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
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
  const t = TRANSLATIONS[language];
  const activeFilterCount = countActiveFilters(filters);

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
    <div className="mt-5 space-y-3">
      {/* Primary Controls Row: Category Tabs, Queue Tabs, Sort + Direction, Filters Toggle, Export */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
        <div className="flex flex-wrap items-center gap-3">
          {/* Category Quick Switch (Compact — expands cleanly via Filters dropdown when >4 categories) */}
          {quickSwitchCategories.length <= 4 ? (
            <div
              className="inline-flex max-w-full items-center p-1 bg-zinc-200/70 rounded-lg overflow-x-auto"
              role="group"
              aria-label={t.settingCategoryLabel}
            >
              <button
                type="button"
                onClick={() => updateFilter('category', 'all')}
                className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  filters.category === 'all'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                {t.categoryAll}
              </button>
              {quickSwitchCategories.map((catId) => (
                <button
                  key={catId}
                  type="button"
                  onClick={() => updateFilter('category', catId)}
                  className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    filters.category === catId
                      ? 'bg-white text-zinc-950 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-950'
                  }`}
                >
                  {getCategoryLabel(catId, language, { short: true })}
                </button>
              ))}
            </div>
          ) : (
            <select
              value={filters.category}
              onChange={(e) => updateFilter('category', e.target.value as CategoryFilter)}
              aria-label={t.settingCategoryLabel}
              className="min-h-[38px] px-3 py-1.5 text-xs font-medium bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
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
          <div
            className="inline-flex max-w-full items-center gap-4 text-xs font-medium pl-1 overflow-x-auto"
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
                className={`py-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  decisionFilter === q.id
                    ? 'text-zinc-950 border-zinc-950'
                    : 'text-zinc-500 border-transparent hover:text-zinc-900'
                }`}
              >
                {q.label}{' '}
                <span className="font-mono tabular-nums text-zinc-400">({q.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Controls: 8-Field Sort + Highest/Lowest + Multi-Filter Toggle + Export CSV/JSON */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 w-full sm:w-auto">
            <label htmlFor="results-sort-field" className="text-xs font-medium text-zinc-500 sr-only">
              {t.sortLabel}
            </label>
            <select
              id="results-sort-field"
              value={sortField}
              onChange={(e) => onChangeSortField(e.target.value as ProductSortField)}
              aria-label={t.sortLabel}
              className="min-h-[38px] min-w-0 flex-1 sm:flex-initial px-3 py-1.5 text-xs font-medium bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
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
              className="inline-flex items-center gap-1 min-h-[38px] px-3 py-1.5 text-xs font-medium bg-white border border-zinc-200 rounded-lg text-zinc-800 hover:border-zinc-400 hover:text-zinc-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
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

          <button
            type="button"
            onClick={() => setFiltersOpen((prev) => !prev)}
            aria-expanded={filtersOpen}
            className={`inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              filtersOpen || activeFilterCount > 0
                ? 'bg-zinc-950 text-white border-zinc-950'
                : 'bg-white text-zinc-800 border-zinc-200 hover:border-zinc-400'
            }`}
          >
            <Filter className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {t.filtersToggleBtn}
              {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </span>
          </button>

          {!exportDisabled && (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={onExportCsv}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium bg-white border border-zinc-200 rounded-lg text-zinc-800 hover:border-zinc-400 hover:text-zinc-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.exportCsvBtn}</span>
              </button>
              <button
                type="button"
                onClick={onExportJson}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium bg-white border border-zinc-200 rounded-lg text-zinc-800 hover:border-zinc-400 hover:text-zinc-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.exportJsonBtn}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expandable 9-Criteria Multi-Filter Panel */}
      {filtersOpen && (
        <div className="bg-white border border-zinc-200/90 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* 1. Score Range */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600">{t.filterScoreRangeLabel}</span>
              <select
                value={filters.scoreRange}
                onChange={(e) =>
                  updateFilter(
                    'scoreRange',
                    e.target.value as ProductResultsFilterState['scoreRange']
                  )
                }
                className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
              >
                <option value="all">{t.filtersAllOption}</option>
                <option value="80+">{t.filterScore80Plus}</option>
                <option value="65-79">{t.filterScore65To79}</option>
                <option value="under-65">{t.filterScoreUnder65}</option>
              </select>
            </label>

            {/* 2. Recommendation Tier */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600">{t.filterDecisionLabel}</span>
              <select
                value={filters.recommendationTier}
                onChange={(e) =>
                  updateFilter(
                    'recommendationTier',
                    e.target.value as 'all' | ProductDecisionVerdict
                  )
                }
                className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
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
              <span className="font-medium text-zinc-600">{t.filterConfidenceLabel}</span>
              <select
                value={filters.confidenceLevel}
                onChange={(e) =>
                  updateFilter('confidenceLevel', e.target.value as 'all' | ConfidenceLevel)
                }
                className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
              >
                <option value="all">{t.filtersAllOption}</option>
                <option value="High">{t.confidenceLabels.High}</option>
                <option value="Medium">{t.confidenceLabels.Medium}</option>
                <option value="Low">{t.confidenceLabels.Low}</option>
              </select>
            </label>

            {/* 4. Competition Level */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600">{t.filterCompetitionLabel}</span>
              <select
                value={filters.competitionLevel}
                onChange={(e) =>
                  updateFilter(
                    'competitionLevel',
                    e.target.value as 'all' | CompetitionLevel | 'unavailable'
                  )
                }
                className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
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
              <span className="font-medium text-zinc-600">{t.filterSalesLabel}</span>
              <select
                value={filters.salesPerformance}
                onChange={(e) =>
                  updateFilter(
                    'salesPerformance',
                    e.target.value as ProductResultsFilterState['salesPerformance']
                  )
                }
                className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
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
              <span className="font-medium text-zinc-600">{t.filterCommissionLabel}</span>
              <select
                value={filters.commissionPotential}
                onChange={(e) =>
                  updateFilter(
                    'commissionPotential',
                    e.target.value as ProductResultsFilterState['commissionPotential']
                  )
                }
                className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
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
              <span className="font-medium text-zinc-600">{t.filterCategoryLabel}</span>
              <select
                value={filters.category}
                onChange={(e) => updateFilter('category', e.target.value as CategoryFilter)}
                className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
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
              <span className="font-medium text-zinc-600">{t.filterModeLabel}</span>
              <select
                value={filters.researchMode}
                onChange={(e) =>
                  updateFilter('researchMode', e.target.value as 'all' | ResearchMode)
                }
                className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
              >
                <option value="all">{t.filtersAllOption}</option>
                <option value="fast">{t.modeFastTitle}</option>
                <option value="balanced">{t.modeBalancedTitle}</option>
                <option value="deep">{t.modeDeepTitle}</option>
              </select>
            </label>

            {/* 9. AI Content Suitability */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600">{t.filterAiSuitabilityLabel}</span>
              <select
                value={filters.aiContentSuitability}
                onChange={(e) =>
                  updateFilter(
                    'aiContentSuitability',
                    e.target.value as 'all' | AiVideoSuitability
                  )
                }
                className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
              >
                <option value="all">{t.filtersAllOption}</option>
                <option value="High">{t.aiVideoLabels.High}</option>
                <option value="Good">{t.aiVideoLabels.Good}</option>
                <option value="Moderate">{t.aiVideoLabels.Moderate}</option>
              </select>
            </label>
          </div>

          {activeFilterCount > 0 && (
            <div className="pt-3 border-t border-zinc-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => onChangeFilters({ ...DEFAULT_PRODUCT_FILTERS })}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 transition-colors cursor-pointer"
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
