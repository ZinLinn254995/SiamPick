import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  GitCompareArrows,
  Globe,
  HardDrive,
  History,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  CategoryFilter,
  DecisionFilter,
  Language,
  OpportunityEvaluation,
  ProductCategory,
  ProductDecision,
  ProductDecisionSummary,
  ProductResultsFilterState,
  ProductSortField,
  ResearchHistoryRecord,
  ResearchMode,
  ResearchProduct,
  SortDirection,
  StorageWriteResult,
  StrategyPreset,
} from '../types/product';
import { formatCredits, formatUsd } from '../utils/kalodataPricing';
import {
  computeStrategyWeights,
  evaluateProductBatch,
  evaluateProductOpportunity,
} from '../utils/scoring';
import {
  computeBestProductSelections,
  DEFAULT_PRODUCT_FILTERS,
  deriveProductDecisionSummary,
  filterProducts,
  sortProductsByField,
} from '../utils/productAnalytics';
import {
  formatByteSize,
  getLocalStorageUsageStats,
} from '../utils/researchHistoryStorage';
import { formatResearchDateTime } from '../utils/savedProductsStorage';
import {
  buildProductsExportCsv,
  buildProductsExportJson,
  triggerFileDownload,
} from '../utils/exportReports';
import { getCategoryLabel, UNIVERSAL_CATEGORIES } from '../utils/categoryRegistry';
import { normalizeTikTokSourceUrl } from '../utils/format';
import { TRANSLATIONS } from '../i18n/translations';
import { ResearchResultCard } from './ResearchResultCard';
import { ResearchComparisonPanel } from './ResearchComparisonPanel';
import { ScoringRubricPanel } from './ScoringRubricPanel';
import { BestProductsStrip } from './BestProductsStrip';
import { ProductFilterBar } from './ProductFilterBar';
import { InfoPopover } from './InfoPopover';

const ARCHIVE_STRATEGY_WEIGHTS: Record<StrategyPreset, number> = {
  balanced: 50,
  'sales-first': 70,
  'commission-first': 30,
};

function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

interface ResearchHistoryViewProps {
  records: ResearchHistoryRecord[];
  savedCount: number;
  currentSalesWeightPct: number;
  storageAlert: StorageWriteResult | null;
  onDismissStorageAlert: () => void;
  getDecision: (id: string) => ProductDecision;
  onSaveProduct: (product: ResearchProduct, researchDate: string) => void;
  comparedKeys?: Set<string>;
  onToggleCompareHistoryProduct?: (
    product: ResearchProduct,
    recordId: string,
    researchDate: string
  ) => void;
  onOpenReport: (
    product: ResearchProduct,
    researchDate: string,
    evaluation?: OpportunityEvaluation,
    peerProducts?: readonly ResearchProduct[],
    researchMode?: ResearchMode
  ) => void;
  onOpenDeepDive?: (
    product: ResearchProduct,
    researchDate: string,
    researchMode?: ResearchMode
  ) => void;
  onDeleteRecords: (ids: string[]) => void;
  onBackToHunting: () => void;
  language: Language;
}

type HistoryTab = 'records' | 'compare';
type HistoryModeFilter = 'all' | ResearchMode;
type HistorySortKey = 'newest' | 'oldest' | 'products-desc' | 'cost-desc' | 'cost-asc';

function modeLabel(mode: ResearchMode, language: Language): string {
  const t = TRANSLATIONS[language];
  if (mode === 'deep') return t.modeDeepTitle;
  if (mode === 'balanced') return t.modeBalancedTitle;
  return t.modeFastTitle;
}

function categoriesLabel(record: ResearchHistoryRecord, language: Language): string {
  const cats = record.selectedCategories;
  if (!cats || cats.length === 0) return '—';
  const labels = cats.map((cat) => getCategoryLabel(cat, language, { short: cats.length > 1 }));
  const base =
    labels.length <= 3
      ? labels.join(', ')
      : `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
  const subNames = record.selectedSubcategoryNames ?? [];
  if (subNames.length > 0) {
    const subPreview =
      subNames.length <= 2 ? subNames.join(', ') : `${subNames[0]} +${subNames.length - 1}`;
    return `${base} (${subPreview})`;
  }
  return base;
}

export function ResearchHistoryView({
  records,
  savedCount,
  currentSalesWeightPct,
  storageAlert,
  onDismissStorageAlert,
  getDecision,
  onSaveProduct,
  comparedKeys,
  onToggleCompareHistoryProduct,
  onOpenReport,
  onOpenDeepDive,
  onDeleteRecords,
  onBackToHunting,
  language,
}: ResearchHistoryViewProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  const [activeTab, setActiveTab] = useState<HistoryTab>('records');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [archiveScoreMode, setArchiveScoreMode] = useState<'original' | 'live'>('original');
  const [archiveLiveWeightPct, setArchiveLiveWeightPct] = useState<number>(currentSalesWeightPct);
  const [archiveLivePreset, setArchiveLivePreset] = useState<StrategyPreset>(
    currentSalesWeightPct >= 62
      ? 'sales-first'
      : currentSalesWeightPct <= 38
        ? 'commission-first'
        : 'balanced'
  );
  const [archiveRubricOpen, setArchiveRubricOpen] = useState(false);
  const [archiveGroundingOpen, setArchiveGroundingOpen] = useState(false);
  const [archiveFilters, setArchiveFilters] = useState<ProductResultsFilterState>({
    ...DEFAULT_PRODUCT_FILTERS,
  });
  const [archiveDecisionFilter, setArchiveDecisionFilter] = useState<DecisionFilter>('active');
  const [archiveSortField, setArchiveSortField] = useState<ProductSortField>('overallScore');
  const [archiveSortDirection, setArchiveSortDirection] = useState<SortDirection>('desc');

  // Search, Filter & Sort state for History List
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<HistoryModeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortKey, setSortKey] = useState<HistorySortKey>('newest');

  // Selective deletion state
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Compare shortcut state
  const [compareOlderId, setCompareOlderId] = useState<string | null>(null);
  const [compareNewerId, setCompareNewerId] = useState<string | null>(null);

  const openArchiveRecord = (rec: ResearchHistoryRecord) => {
    setArchiveScoreMode('original');
    const origWeight = rec.researchSettings.salesWeightPct ?? currentSalesWeightPct;
    setArchiveLiveWeightPct(origWeight);
    setArchiveLivePreset(
      origWeight >= 62 ? 'sales-first' : origWeight <= 38 ? 'commission-first' : 'balanced'
    );
    setArchiveFilters({ ...DEFAULT_PRODUCT_FILTERS });
    setArchiveDecisionFilter('active');
    setArchiveSortField('overallScore');
    setArchiveSortDirection('desc');
    setArchiveGroundingOpen(false);
    setSelectedRecordId(rec.id);
  };

  const handleArchiveSelectPreset = (preset: StrategyPreset) => {
    setArchiveScoreMode('live');
    setArchiveLivePreset(preset);
    setArchiveLiveWeightPct(ARCHIVE_STRATEGY_WEIGHTS[preset]);
  };

  const handleArchiveCustomWeightChange = (newSalesWeight: number) => {
    setArchiveScoreMode('live');
    setArchiveLiveWeightPct(newSalesWeight);
    if (newSalesWeight >= 62) {
      setArchiveLivePreset('sales-first');
    } else if (newSalesWeight <= 38) {
      setArchiveLivePreset('commission-first');
    } else {
      setArchiveLivePreset('balanced');
    }
  };

  const storageStats = useMemo(
    () => getLocalStorageUsageStats(records.length, savedCount),
    [records, savedCount]
  );

  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedRecordId) ?? null,
    [records, selectedRecordId]
  );

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = records.filter((rec) => {
      if (modeFilter !== 'all' && rec.researchMode !== modeFilter) return false;
      if (categoryFilter !== 'all' && !rec.selectedCategories.includes(categoryFilter)) {
        return false;
      }
      if (!q) return true;

      if (rec.id.toLowerCase().includes(q)) return true;
      if (categoriesLabel(rec, language).toLowerCase().includes(q)) return true;
      if (modeLabel(rec.researchMode, language).toLowerCase().includes(q)) return true;

      return rec.products.some(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.nameMy.toLowerCase().includes(q) ||
          p.shopName.toLowerCase().includes(q) ||
          (p.brand ?? '').toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.kalodataMetrics?.productId ?? '').toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      const timeA = new Date(a.researchedAt).getTime();
      const timeB = new Date(b.researchedAt).getTime();
      switch (sortKey) {
        case 'newest':
          return timeB - timeA;
        case 'oldest':
          return timeA - timeB;
        case 'products-desc':
          return b.productCount - a.productCount || timeB - timeA;
        case 'cost-desc':
          return (b.actualCredits ?? -1) - (a.actualCredits ?? -1) || timeB - timeA;
        case 'cost-asc':
          return (
            (a.actualCredits ?? Number.POSITIVE_INFINITY) -
              (b.actualCredits ?? Number.POSITIVE_INFINITY) || timeB - timeA
          );
        default:
          return 0;
      }
    });
  }, [records, searchQuery, modeFilter, categoryFilter, sortKey, language]);

  const effectiveArchiveSalesWeightPct = useMemo(() => {
    if (!selectedRecord) return currentSalesWeightPct;
    return archiveScoreMode === 'live'
      ? archiveLiveWeightPct
      : selectedRecord.researchSettings.salesWeightPct ?? 50;
  }, [selectedRecord, archiveScoreMode, archiveLiveWeightPct, currentSalesWeightPct]);

  const effectiveArchiveStrategyPreset: StrategyPreset = useMemo(() => {
    if (archiveScoreMode === 'live') return archiveLivePreset;
    const origWeight = selectedRecord?.researchSettings.salesWeightPct ?? 50;
    if (selectedRecord?.researchSettings.strategyPreset) {
      return selectedRecord.researchSettings.strategyPreset;
    }
    return origWeight >= 62 ? 'sales-first' : origWeight <= 38 ? 'commission-first' : 'balanced';
  }, [archiveScoreMode, archiveLivePreset, selectedRecord]);

  // Precompute evaluations for currently inspected archived session
  const selectedArchiveEvaluations = useMemo(() => {
    if (!selectedRecord) return new Map<string, OpportunityEvaluation>();
    const weightToUse = effectiveArchiveSalesWeightPct;

    if (archiveScoreMode === 'original') {
      const map = new Map<string, OpportunityEvaluation>();
      for (const product of selectedRecord.products) {
        const snap = selectedRecord.scoreSnapshots[product.id];
        if (snap && Array.isArray(snap.criteria) && snap.criteria.length === 7) {
          const fallbackEval = evaluateProductOpportunity(product, {
            salesWeightPct: snap.salesWeightPct,
            strategyPreset: snap.strategyPreset,
            peerProducts: selectedRecord.products,
          });
          map.set(product.id, {
            ...fallbackEval,
            totalScore: snap.totalScore,
            tier: snap.tier,
            confidenceLevel: snap.confidenceLevel,
            confidencePct: snap.confidencePct,
            verifiedCount: snap.verifiedCount,
            estimatedCount: snap.estimatedCount,
            unverifiedCount: snap.unverifiedCount,
            unavailableCount: snap.unavailableCount,
            redistributedWeightPct: snap.redistributedWeightPct,
            salesWeightPct: snap.salesWeightPct,
            strategyPreset: snap.strategyPreset,
            weights: computeStrategyWeights(snap.salesWeightPct, product.category),
            criteria: snap.criteria,
            strengthsEn: snap.strengthsEn,
            strengthsMy: snap.strengthsMy,
            weaknessesEn: snap.weaknessesEn,
            weaknessesMy: snap.weaknessesMy,
            risksEn: snap.risksEn,
            risksMy: snap.risksMy,
          });
        } else {
          map.set(
            product.id,
            evaluateProductOpportunity(product, {
              salesWeightPct: weightToUse,
              peerProducts: selectedRecord.products,
            })
          );
        }
      }
      return map;
    }

    return evaluateProductBatch(selectedRecord.products, {
      salesWeightPct: archiveLiveWeightPct,
      strategyPreset: archiveLivePreset,
    });
  }, [
    selectedRecord,
    archiveScoreMode,
    effectiveArchiveSalesWeightPct,
    archiveLiveWeightPct,
    archiveLivePreset,
  ]);

  // Multi-signal Product Decision Summaries for archived products (same engine as live results)
  const selectedArchiveDecisions = useMemo(() => {
    const map = new Map<string, ProductDecisionSummary>();
    if (!selectedRecord) return map;
    for (const product of selectedRecord.products) {
      const ev = selectedArchiveEvaluations.get(product.id);
      if (ev) {
        map.set(product.id, deriveProductDecisionSummary(product, ev));
      }
    }
    return map;
  }, [selectedRecord, selectedArchiveEvaluations]);

  const archiveQueueCounts = useMemo(() => {
    let active = 0;
    let saved = 0;
    let rejected = 0;
    if (!selectedRecord) return { active, saved, rejected };
    for (const p of selectedRecord.products) {
      const d = getDecision(p.id);
      if (d === 'rejected') {
        rejected += 1;
      } else {
        active += 1;
        if (d === 'saved') saved += 1;
      }
    }
    return { active, saved, rejected };
  }, [selectedRecord, getDecision]);

  const availableArchiveCategories = useMemo<ProductCategory[]>(() => {
    if (!selectedRecord) return [];
    const seen = new Set<ProductCategory>();
    for (const product of selectedRecord.products) {
      seen.add(product.category);
    }
    return Array.from(seen);
  }, [selectedRecord]);

  const visibleArchiveProducts = useMemo<ResearchProduct[]>(() => {
    if (!selectedRecord) return [];
    const queueFiltered = selectedRecord.products.filter((product) => {
      const d = getDecision(product.id);
      if (archiveDecisionFilter === 'active') return d !== 'rejected';
      if (archiveDecisionFilter === 'saved') return d === 'saved';
      if (archiveDecisionFilter === 'rejected') return d === 'rejected';
      return true;
    });

    const multiFiltered = filterProducts(
      queueFiltered,
      selectedArchiveEvaluations,
      archiveFilters,
      selectedArchiveDecisions
    );

    return sortProductsByField(
      multiFiltered,
      selectedArchiveEvaluations,
      archiveSortField,
      archiveSortDirection
    );
  }, [
    selectedRecord,
    getDecision,
    archiveDecisionFilter,
    selectedArchiveEvaluations,
    archiveFilters,
    selectedArchiveDecisions,
    archiveSortField,
    archiveSortDirection,
  ]);

  const archiveBestSelections = useMemo(
    () =>
      visibleArchiveProducts.length > 0
        ? computeBestProductSelections(visibleArchiveProducts, selectedArchiveEvaluations)
        : [],
    [visibleArchiveProducts, selectedArchiveEvaluations]
  );

  const comparedArchiveProductIds = useMemo(() => {
    const set = new Set<string>();
    if (!selectedRecord || !comparedKeys) return set;
    const prefix = `history:${selectedRecord.id}:`;
    for (const product of selectedRecord.products) {
      if (comparedKeys.has(`${prefix}${product.id}`)) {
        set.add(product.id);
      }
    }
    return set;
  }, [selectedRecord, comparedKeys]);

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = () => {
    if (checkedIds.length === 0) return;
    onDeleteRecords(checkedIds);
    if (selectedRecordId && checkedIds.includes(selectedRecordId)) {
      setSelectedRecordId(null);
    }
    setCheckedIds([]);
  };

  const handleDeleteSingle = (id: string) => {
    onDeleteRecords([id]);
    setConfirmDeleteId(null);
    setCheckedIds((prev) => prev.filter((item) => item !== id));
    if (selectedRecordId === id) {
      setSelectedRecordId(null);
    }
  };

  const handleOpenCompareWith = (record: ResearchHistoryRecord) => {
    const idx = records.findIndex((r) => r.id === record.id);
    if (idx === 0 && records.length > 1) {
      setCompareNewerId(record.id);
      setCompareOlderId(records[1].id);
    } else if (idx > 0) {
      setCompareOlderId(record.id);
      setCompareNewerId(records[0].id);
    }
    setSelectedRecordId(null);
    setActiveTab('compare');
  };

  // Detail View for a single archived Research History record (full Research Results parity)
  if (selectedRecord) {
    const handleExportArchiveCsv = () => {
      if (visibleArchiveProducts.length === 0) return;
      const csv = buildProductsExportCsv(visibleArchiveProducts, {
        salesWeightPct: effectiveArchiveSalesWeightPct,
        evaluations: selectedArchiveEvaluations,
        researchDate: selectedRecord.researchedAt,
        exportTitle: `SiamPick History Archive ${selectedRecord.id}`,
        language,
      });
      triggerFileDownload(
        csv,
        `siampick-history-${selectedRecord.id}.csv`,
        'text/csv;charset=utf-8;'
      );
    };

    const handleExportArchiveJson = () => {
      if (visibleArchiveProducts.length === 0) return;
      const json = buildProductsExportJson(visibleArchiveProducts, {
        salesWeightPct: effectiveArchiveSalesWeightPct,
        evaluations: selectedArchiveEvaluations,
        researchDate: selectedRecord.researchedAt,
        exportTitle: `SiamPick History Archive ${selectedRecord.id}`,
        language,
      });
      triggerFileDownload(
        json,
        `siampick-history-${selectedRecord.id}.json`,
        'application/json;charset=utf-8;'
      );
    };

    const archiveCostSummary = selectedRecord.costSummary;
    const archiveSources = selectedRecord.groundingSources ?? [];
    const archiveQueries = selectedRecord.searchQueries ?? [];
    const hasSourcesOrCostBar = archiveSources.length > 0 || archiveCostSummary !== null;

    return (
      <section aria-labelledby="archive-detail-heading" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedRecordId(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer py-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.historyBackToListBtn}</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {records.length >= 2 && (
              <button
                type="button"
                onClick={() => handleOpenCompareWith(selectedRecord)}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                <GitCompareArrows className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.historyCompareBtn}</span>
              </button>
            )}
          </div>
        </div>

        {/* Immutable Archived Snapshot Banner */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {t.historyArchiveBannerTitle}
                </span>
                <InfoPopover
                  label={t.historyArchiveBannerTitle}
                  title={t.historyArchiveBannerTitle}
                  content={t.historyArchiveBannerDesc}
                />
                <span aria-hidden="true">·</span>
                <span className="font-mono text-zinc-600 dark:text-zinc-400 tabular-nums">
                  {selectedRecord.id}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                <h1
                  id="archive-detail-heading"
                  className="font-display text-xl sm:text-2xl font-bold text-zinc-950 dark:text-zinc-50"
                >
                  {formatResearchDateTime(selectedRecord.researchedAt, language)}
                </h1>
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  ({visibleArchiveProducts.length}/{selectedRecord.products.length})
                </span>
              </div>
            </div>

            {/* Score View Mode Switch (Original Session Scores vs Interactive Strategy Slider) */}
            <div
              className="inline-flex items-center p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg self-start shrink-0"
              role="group"
              aria-label="Score view mode"
            >
              <button
                type="button"
                onClick={() => setArchiveScoreMode('original')}
                className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  archiveScoreMode === 'original'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                }`}
              >
                {t.historyScoreModeOriginal}
              </button>
              <button
                type="button"
                onClick={() => setArchiveScoreMode('live')}
                className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  archiveScoreMode === 'live'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                }`}
              >
                {t.historyScoreModeLive} ({archiveLiveWeightPct}/{100 - archiveLiveWeightPct})
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/70 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span>
              <strong className="text-zinc-950 dark:text-zinc-50">
                {modeLabel(selectedRecord.researchMode, language)}
              </strong>
            </span>
            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
              ·
            </span>
            <span>{categoriesLabel(selectedRecord, language)}</span>
            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
              ·
            </span>
            <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
              {selectedRecord.productCount}/{selectedRecord.requestedQuantity}{' '}
              {t.quantityProductsUnit}
            </span>
            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
              ·
            </span>
            <span className="font-mono tabular-nums">
              {t.estimatedCostLabel}:{' '}
              {selectedRecord.estimatedCredits !== null
                ? `${formatCredits(selectedRecord.estimatedCredits)} cr`
                : t.actualCostUnavailable}
            </span>
            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
              ·
            </span>
            <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
              {t.actualCostLabel}:{' '}
              {selectedRecord.actualCredits !== null
                ? `${formatCredits(selectedRecord.actualCredits)} cr${
                    selectedRecord.actualUsd !== null
                      ? ` (≈ ${formatUsd(selectedRecord.actualUsd)})`
                      : ''
                  }`
                : t.actualCostUnavailable}
            </span>
          </div>
        </div>

        {/* Transparent 7-Factor Product Scoring Engine Guide & Strategy Weights (Matches Research Results) */}
        <ScoringRubricPanel
          isOpen={archiveRubricOpen}
          onToggle={() => setArchiveRubricOpen((prev) => !prev)}
          salesWeightPct={effectiveArchiveSalesWeightPct}
          language={language}
        />

        {/* Interactive Strategy Slider Bar (Recalculates Archived Scores & Re-Sorts Instantly without mutating archive) */}
        {selectedRecord.products.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-4 sm:px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 mr-1">
                <SlidersHorizontal
                  className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400"
                  aria-hidden="true"
                />
                <span>{t.strategyLabel}</span>
              </span>
              {(
                [
                  { id: 'sales-first', label: t.strategySales },
                  { id: 'balanced', label: t.strategyBalanced },
                  { id: 'commission-first', label: t.strategyCommission },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleArchiveSelectPreset(preset.id)}
                  className={`min-h-[32px] px-3 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                    effectiveArchiveStrategyPreset === preset.id
                      ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                      : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-zinc-50'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="w-full lg:w-72 space-y-1 shrink-0">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {t.commissionWeight}{' '}
                  <strong className="font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {100 - effectiveArchiveSalesWeightPct}%
                  </strong>
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {t.salesWeight}{' '}
                  <strong className="font-mono text-zinc-950 dark:text-zinc-50 tabular-nums">
                    {effectiveArchiveSalesWeightPct}%
                  </strong>
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={effectiveArchiveSalesWeightPct}
                onChange={(e) => handleArchiveCustomWeightChange(Number(e.target.value))}
                aria-label={t.strategyLabel}
                className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-950 dark:accent-zinc-100"
              />
            </div>
          </div>
        )}

        {/* Kalodata OpenAPI Verified Sources & API Call Breakdown Bar (Matches Research Results) */}
        {hasSourcesOrCostBar && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs min-w-0">
                <Globe
                  className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0"
                  aria-hidden="true"
                />
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                  {t.kalodataSourceBarLabel}
                </span>
                <InfoPopover
                  variant="info"
                  label={t.kalodataSourceBarLabel}
                  title={t.kalodataSourceBarLabel}
                  content={
                    <div className="space-y-1.5">
                      <p>{t.kalodataSourceNote}</p>
                      {selectedRecord.productCount < selectedRecord.requestedQuantity && (
                        <p className="text-zinc-500 dark:text-zinc-400">
                          {t.qualityGateExcludedNote}
                        </p>
                      )}
                    </div>
                  }
                />
                {archiveSources.length > 0 && (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono text-zinc-600 dark:text-zinc-400 tabular-nums">
                      {archiveSources.length} {t.groundingSourcesCount}
                    </span>
                  </>
                )}
                <span className="text-zinc-300 dark:text-zinc-600" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono text-zinc-700 dark:text-zinc-300 tabular-nums">
                  {selectedRecord.productCount}/{selectedRecord.requestedQuantity}{' '}
                  {t.qualityGateVerifiedLabel}
                </span>
              </div>

              {(archiveSources.length > 0 || archiveQueries.length > 0) && (
                <button
                  type="button"
                  onClick={() => setArchiveGroundingOpen((prev) => !prev)}
                  aria-expanded={archiveGroundingOpen}
                  className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer shrink-0 whitespace-nowrap py-1"
                >
                  <span>
                    {archiveGroundingOpen ? t.groundingToggleHide : t.groundingToggleShow}
                  </span>
                  {archiveGroundingOpen ? (
                    <ChevronUp className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              )}
            </div>

            {archiveCostSummary && (
              <div className="px-4 sm:px-5 py-2.5 bg-zinc-50/80 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800/70 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-zinc-700 dark:text-zinc-300">
                <span className="font-sans font-semibold text-zinc-900 dark:text-zinc-100">
                  {modeLabel(archiveCostSummary.researchMode, language)}
                </span>
                <span>
                  {[
                    archiveCostSummary.rankApiCalls > 0
                      ? `${t.breakdownRankLabel}: ${archiveCostSummary.rankApiCalls}`
                      : null,
                    (archiveCostSummary.videoRankApiCalls ?? 0) > 0
                      ? `${t.breakdownVideoRankLabel}: ${archiveCostSummary.videoRankApiCalls}`
                      : null,
                    archiveCostSummary.productDetailApiCalls > 0
                      ? `${t.breakdownDetailLabel}: ${archiveCostSummary.productDetailApiCalls}`
                      : null,
                    archiveCostSummary.shopDetailApiCalls > 0
                      ? `${t.breakdownShopLabel}: ${archiveCostSummary.shopDetailApiCalls}`
                      : null,
                    archiveCostSummary.commentInsightApiCalls > 0
                      ? `${t.breakdownReviewLabel}: ${archiveCostSummary.commentInsightApiCalls}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {archiveCostSummary.geminiAnalysisApplied && (
                  <span className="font-sans text-emerald-700 dark:text-emerald-400 font-medium">
                    {t.geminiAnalysisActiveLabel}
                  </span>
                )}
                <span>
                  {t.estimatedCostLabel}: {formatCredits(archiveCostSummary.estimatedCredits)}{' '}
                  {t.creditsUnit} (≈ {formatUsd(archiveCostSummary.estimatedUsd)})
                </span>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  {t.actualCostLabel}:{' '}
                  {archiveCostSummary.actualCredits !== null
                    ? `${formatCredits(archiveCostSummary.actualCredits)} ${t.creditsUnit} (≈ ${formatUsd(archiveCostSummary.actualUsd ?? 0)} · ${archiveCostSummary.actualApiCalls} ${t.actualCallsLabel})`
                    : t.actualCostUnavailable}
                </span>
              </div>
            )}

            {archiveGroundingOpen && (
              <div className="border-t border-zinc-100 dark:border-zinc-800/70 px-4 sm:px-5 pb-4 pt-3 space-y-3">
                {archiveQueries.length > 0 && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300 mr-1.5">
                      {t.groundingQueriesLabel}:
                    </span>
                    <span>{archiveQueries.join(' · ')}</span>
                  </div>
                )}
                {archiveSources.length > 0 && (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                    {archiveSources.map((src, idx) => {
                      const resolvedHref = isSafeHttpUrl(src.url)
                        ? normalizeTikTokSourceUrl(src.url)
                        : null;
                      return (
                        <li
                          key={`${idx}-${src.url}`}
                          className="flex items-center justify-between gap-2 py-1 border-b border-zinc-100 dark:border-zinc-800/70 text-xs"
                        >
                          <span className="text-zinc-700 dark:text-zinc-300 truncate">
                            {src.title}{' '}
                            <span className="text-zinc-400 dark:text-zinc-500">({src.domain})</span>
                          </span>
                          {resolvedHref ? (
                            <a
                              href={resolvedHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-zinc-900 dark:text-zinc-100 hover:underline whitespace-nowrap shrink-0"
                            >
                              <span>{t.sourceOpenLink}</span>
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </a>
                          ) : (
                            <span className="text-zinc-400 dark:text-zinc-500 whitespace-nowrap shrink-0">
                              {t.sourcePendingLink}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* Phase 5: Best Product Selection Highlights (6 Categories with Sufficiency Guards) */}
        {archiveBestSelections.length > 0 && (
          <BestProductsStrip
            selections={archiveBestSelections}
            comparedIds={comparedArchiveProductIds}
            onOpenReport={(prod) =>
              onOpenReport(
                prod,
                selectedRecord.researchedAt,
                selectedArchiveEvaluations.get(prod.id),
                selectedRecord.products,
                selectedRecord.researchMode
              )
            }
            onToggleCompare={(prod) =>
              onToggleCompareHistoryProduct?.(
                prod,
                selectedRecord.id,
                selectedRecord.researchedAt
              )
            }
            language={language}
          />
        )}

        {/* Phase 5: 8-Field Sort + Highest/Lowest + 9-Criteria Multi-Filter + Export CSV/JSON */}
        <ProductFilterBar
          filters={archiveFilters}
          onChangeFilters={setArchiveFilters}
          decisionFilter={archiveDecisionFilter}
          onChangeDecisionFilter={setArchiveDecisionFilter}
          queueCounts={archiveQueueCounts}
          sortField={archiveSortField}
          onChangeSortField={setArchiveSortField}
          sortDirection={archiveSortDirection}
          onToggleSortDirection={() =>
            setArchiveSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))
          }
          exportDisabled={visibleArchiveProducts.length === 0}
          onExportCsv={handleExportArchiveCsv}
          onExportJson={handleExportArchiveJson}
          availableCategories={availableArchiveCategories}
          language={language}
        />

        {/* Archived Product Cards Grid or Filtered Empty State */}
        {visibleArchiveProducts.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-6 py-14 text-center">
            <h3 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
              {t.emptyFilteredTitle}
            </h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
              {t.emptyFilteredDesc}
            </p>
            <button
              type="button"
              onClick={() => {
                setArchiveFilters({ ...DEFAULT_PRODUCT_FILTERS });
                setArchiveDecisionFilter('active');
              }}
              className="mt-5 inline-flex items-center gap-2 min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-lg hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>{t.resetViewBtn}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleArchiveProducts.map((product) => {
              const evalResult = selectedArchiveEvaluations.get(product.id);
              const decisionSummary = selectedArchiveDecisions.get(product.id);
              const compareKey = `history:${selectedRecord.id}:${product.id}`;
              return (
                <ResearchResultCard
                  key={`${selectedRecord.id}-${product.id}`}
                  product={product}
                  evaluation={evalResult}
                  decisionSummary={decisionSummary}
                  salesWeightPct={effectiveArchiveSalesWeightPct}
                  peerProducts={selectedRecord.products}
                  decision={getDecision(product.id)}
                  onSave={() => onSaveProduct(product, selectedRecord.researchedAt)}
                  onReject={() => {}}
                  hideRejectAction
                  isCompared={comparedKeys?.has(compareKey) ?? false}
                  onToggleCompare={
                    onToggleCompareHistoryProduct
                      ? (prod) =>
                          onToggleCompareHistoryProduct(
                            prod,
                            selectedRecord.id,
                            selectedRecord.researchedAt
                          )
                      : undefined
                  }
                  onOpenReport={(prod) =>
                    onOpenReport(
                      prod,
                      selectedRecord.researchedAt,
                      evalResult,
                      selectedRecord.products,
                      selectedRecord.researchMode
                    )
                  }
                  onOpenDeepDive={
                    onOpenDeepDive
                      ? (prod) =>
                          onOpenDeepDive(
                            prod,
                            selectedRecord.researchedAt,
                            selectedRecord.researchMode
                          )
                      : undefined
                  }
                  language={language}
                />
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="history-view-heading" className="space-y-6">
      {/* Header & Back Navigation */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBackToHunting}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer py-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t.savedViewBackBtn}</span>
        </button>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <h1
                id="history-view-heading"
                className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50"
              >
                {t.historyViewTitle}
              </h1>
              <span className="font-mono text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">
                ({records.length})
              </span>
              <InfoPopover
                label={t.historyViewTitle}
                title={t.historyViewTitle}
                content={
                  <>
                    <p>{t.historyViewSubtitle}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-1 border-t border-zinc-100 dark:border-zinc-800/70">
                      {t.historyStorageNote}
                    </p>
                  </>
                }
              />
            </div>
          </div>

          {/* Sub-Tabs: History Sessions | Compare Sessions */}
          <div
            className="inline-flex items-center p-1 bg-zinc-200/70 dark:bg-zinc-700/70 rounded-lg self-start md:self-auto shrink-0"
            role="tablist"
            aria-label={t.historyViewTitle}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'records'}
              onClick={() => setActiveTab('records')}
              className={`inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'records'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
              }`}
            >
              <History className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.historyTabRecords}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'compare'}
              onClick={() => setActiveTab('compare')}
              className={`inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'compare'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
              }`}
            >
              <GitCompareArrows className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.historyTabCompare}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quota Exceeded / Storage Warning Banner */}
      {storageAlert && !storageAlert.ok && (
        <div
          role="alert"
          className="p-4 bg-red-50/90 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl flex items-start justify-between gap-3 text-xs text-red-900 dark:text-red-200"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <div className="font-semibold">{t.historyQuotaWarningTitle}</div>
              <p className="mt-0.5 text-red-800 dark:text-red-300 leading-relaxed">
                {isMy ? storageAlert.errorMy ?? storageAlert.errorEn : storageAlert.errorEn}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismissStorageAlert}
            aria-label={t.historyQuotaWarningDismiss}
            className="text-red-700 dark:text-red-400 hover:text-red-950 dark:hover:text-red-200 p-1 rounded cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Local Storage Usage Monitor */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100">
            <HardDrive className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
            <span>{t.historyStorageUsageLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-600 dark:text-zinc-400 tabular-nums">
            <span>
              History ({storageStats.historyCount}): {formatByteSize(storageStats.historyBytes)}
            </span>
            <span>
              Saved ({storageStats.savedCount}): {formatByteSize(storageStats.savedBytes)}
            </span>
            <span className="font-semibold text-zinc-950 dark:text-zinc-50">
              {formatByteSize(storageStats.totalBytes)} /{' '}
              {formatByteSize(storageStats.estimatedQuotaBytes)} ({storageStats.usagePct}%)
            </span>
          </div>
        </div>
        <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              storageStats.usagePct >= 85
                ? 'bg-red-600'
                : storageStats.usagePct >= 60
                  ? 'bg-amber-500'
                  : 'bg-zinc-900 dark:bg-zinc-200'
            }`}
            style={{ width: `${Math.max(1, Math.min(100, storageStats.usagePct))}%` }}
          />
        </div>
      </div>

      {/* Active Tab Content */}
      {activeTab === 'compare' ? (
        <ResearchComparisonPanel
          historyRecords={records}
          initialOlderId={compareOlderId}
          initialNewerId={compareNewerId}
          onOpenProductReport={(product, researchDate) => onOpenReport(product, researchDate)}
          language={language}
        />
      ) : records.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-6 py-16 text-center">
          <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 inline-flex items-center justify-center mb-4">
            <History className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="font-display text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {t.historyEmptyTitle}
          </h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
            {t.historyEmptyDesc}
          </p>
          <button
            type="button"
            onClick={onBackToHunting}
            className="mt-6 inline-flex items-center gap-2 min-h-[42px] px-5 py-2 text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-lg hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>{t.savedViewBackBtn}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search, Filter, Sort & Selective Delete Controls */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Search */}
              <div className="md:col-span-5 relative">
                <Search
                  className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.historySearchPlaceholder}
                  aria-label={t.historySearchPlaceholder}
                  className="w-full min-h-[40px] pl-9 pr-3 py-2 text-xs sm:text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300"
                />
              </div>

              {/* Mode Filter */}
              <div className="md:col-span-2">
                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value as HistoryModeFilter)}
                  aria-label={t.researchModeLabel}
                  className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
                >
                  <option value="all">{t.historyFilterAllModes}</option>
                  <option value="fast">{t.modeFastTitle}</option>
                  <option value="balanced">{t.modeBalancedTitle}</option>
                  <option value="deep">{t.modeDeepTitle}</option>
                </select>
              </div>

              {/* Category Filter */}
              <div className="md:col-span-2">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                  aria-label={t.settingCategoryLabel}
                  className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
                >
                  <option value="all">{t.categoryAll}</option>
                  {UNIVERSAL_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {getCategoryLabel(cat.id, language)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort */}
              <div className="md:col-span-3">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as HistorySortKey)}
                  aria-label={t.sortLabel}
                  className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
                >
                  <option value="newest">{t.historySortNewest}</option>
                  <option value="oldest">{t.historySortOldest}</option>
                  <option value="products-desc">{t.historySortMostProducts}</option>
                  <option value="cost-desc">{t.historySortCostDesc}</option>
                  <option value="cost-asc">{t.historySortCostAsc}</option>
                </select>
              </div>
            </div>

            {checkedIds.length > 0 && (
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-mono text-zinc-700 dark:text-zinc-300 tabular-nums">
                  {checkedIds.length} {t.historySelectedCount}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCheckedIds([])}
                    className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 cursor-pointer"
                  >
                    {t.confirmCancelBtn}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium text-white bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-500 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {t.historyDeleteSelectedBtn} ({checkedIds.length})
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* History Records List */}
          {filteredRecords.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-6 py-12 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.emptyFilteredTitle}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((rec) => {
                const isChecked = checkedIds.includes(rec.id);
                const isConfirmingDelete = confirmDeleteId === rec.id;

                return (
                  <article
                    key={rec.id}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 sm:p-5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleChecked(rec.id)}
                          aria-label={`${t.historySelectLabel} ${rec.id}`}
                          className="mt-1 w-4 h-4 rounded-sm border-zinc-300 dark:border-zinc-700 accent-zinc-950 dark:accent-zinc-100 cursor-pointer shrink-0"
                        />

                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <button
                              type="button"
                              onClick={() => openArchiveRecord(rec)}
                              className="inline-flex items-center gap-1.5 font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50 hover:underline text-left cursor-pointer"
                            >
                              <Calendar className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" aria-hidden="true" />
                              <span>{formatResearchDateTime(rec.researchedAt, language)}</span>
                            </button>
                            <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                              {rec.id}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              {modeLabel(rec.researchMode, language)}
                            </span>
                            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                              ·
                            </span>
                            <span>{categoriesLabel(rec, language)}</span>
                            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                              {rec.productCount} {t.quantityProductsUnit}
                            </span>
                            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                              ·
                            </span>
                            <span className="font-mono tabular-nums">
                              {t.actualCostLabel}:{' '}
                              {rec.actualCredits !== null ? (
                                <strong className="text-emerald-700 dark:text-emerald-400">
                                  {formatCredits(rec.actualCredits)} cr
                                </strong>
                              ) : (
                                <span className="text-zinc-400 dark:text-zinc-500">{t.actualCostUnavailable}</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Row Actions */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0 pl-7 lg:pl-0">
                        <button
                          type="button"
                          onClick={() => openArchiveRecord(rec)}
                          className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t.historyViewResultsBtn}</span>
                        </button>

                        {records.length >= 2 && (
                          <button
                            type="button"
                            onClick={() => handleOpenCompareWith(rec)}
                            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-zinc-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <GitCompareArrows className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t.historyCompareBtn}</span>
                          </button>
                        )}

                        {isConfirmingDelete ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDeleteSingle(rec.id)}
                              className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-white bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                            >
                              {t.historyDeleteConfirmBtn}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 cursor-pointer whitespace-nowrap"
                            >
                              {t.confirmCancelBtn}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(rec.id)}
                            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-red-300 dark:hover:border-red-700 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50/40 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t.historyDeleteBtn}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
