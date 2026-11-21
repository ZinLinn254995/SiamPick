import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Download,
  Eye,
  GitCompareArrows,
  HardDrive,
  History,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  CategoryFilter,
  Language,
  OpportunityEvaluation,
  ProductDecision,
  ResearchHistoryRecord,
  ResearchMode,
  ResearchProduct,
  StorageWriteResult,
} from '../types/product';
import { formatCredits, formatUsd } from '../utils/kalodataPricing';
import {
  computeStrategyWeights,
  evaluateProductBatch,
  evaluateProductOpportunity,
} from '../utils/scoring';
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
import { TRANSLATIONS } from '../i18n/translations';
import { ResearchResultCard } from './ResearchResultCard';
import { ResearchComparisonPanel } from './ResearchComparisonPanel';
import { InfoPopover } from './InfoPopover';

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
    peerProducts?: readonly ResearchProduct[]
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
  onDeleteRecords,
  onBackToHunting,
  language,
}: ResearchHistoryViewProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  const [activeTab, setActiveTab] = useState<HistoryTab>('records');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [archiveScoreMode, setArchiveScoreMode] = useState<'original' | 'live'>('original');

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

  // Precompute evaluations for currently inspected archived session
  const selectedArchiveEvaluations = useMemo(() => {
    if (!selectedRecord) return new Map<string, OpportunityEvaluation>();
    const weightToUse =
      archiveScoreMode === 'live'
        ? currentSalesWeightPct
        : selectedRecord.researchSettings.salesWeightPct ?? 50;

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
      salesWeightPct: currentSalesWeightPct,
    });
  }, [selectedRecord, archiveScoreMode, currentSalesWeightPct]);

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

  // Detail View for a single archived Research History record
  if (selectedRecord) {
    const sortedProducts = [...selectedRecord.products].sort((a, b) => {
      const scoreA = selectedArchiveEvaluations.get(a.id)?.totalScore ?? a.opportunityScore;
      const scoreB = selectedArchiveEvaluations.get(b.id)?.totalScore ?? b.opportunityScore;
      return scoreB - scoreA;
    });

    return (
      <section aria-labelledby="archive-detail-heading" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedRecordId(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 transition-colors cursor-pointer py-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.historyBackToListBtn}</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const csv = buildProductsExportCsv(sortedProducts, {
                  salesWeightPct:
                    archiveScoreMode === 'live'
                      ? currentSalesWeightPct
                      : selectedRecord.researchSettings.salesWeightPct ?? 50,
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
              }}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 rounded-lg hover:border-zinc-400 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.exportCsvBtn}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const json = buildProductsExportJson(sortedProducts, {
                  salesWeightPct:
                    archiveScoreMode === 'live'
                      ? currentSalesWeightPct
                      : selectedRecord.researchSettings.salesWeightPct ?? 50,
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
              }}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 rounded-lg hover:border-zinc-400 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.exportJsonBtn}</span>
            </button>

            {records.length >= 2 && (
              <button
                type="button"
                onClick={() => handleOpenCompareWith(selectedRecord)}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 rounded-lg hover:border-zinc-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                <GitCompareArrows className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.historyCompareBtn}</span>
              </button>
            )}
          </div>
        </div>

        {/* Immutable Archived Snapshot Banner */}
        <div className="bg-white border border-zinc-200/90 rounded-xl p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span className="font-semibold text-zinc-900">{t.historyArchiveBannerTitle}</span>
                <InfoPopover
                  label={t.historyArchiveBannerTitle}
                  title={t.historyArchiveBannerTitle}
                  content={t.historyArchiveBannerDesc}
                />
                <span aria-hidden="true">·</span>
                <span className="font-mono text-zinc-600 tabular-nums">{selectedRecord.id}</span>
              </div>
              <h1
                id="archive-detail-heading"
                className="font-display text-xl sm:text-2xl font-bold text-zinc-950"
              >
                {formatResearchDateTime(selectedRecord.researchedAt, language)}
              </h1>
            </div>

            {/* Score View Mode Switch (Original Session Scores vs Current Strategy Slider) */}
            <div
              className="inline-flex items-center p-1 bg-zinc-100 rounded-lg self-start shrink-0"
              role="group"
              aria-label="Score view mode"
            >
              <button
                type="button"
                onClick={() => setArchiveScoreMode('original')}
                className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  archiveScoreMode === 'original'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                {t.historyScoreModeOriginal}
              </button>
              <button
                type="button"
                onClick={() => setArchiveScoreMode('live')}
                className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  archiveScoreMode === 'live'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                {t.historyScoreModeLive} ({currentSalesWeightPct}/{100 - currentSalesWeightPct})
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-100 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-600">
            <span>
              <strong className="text-zinc-950">
                {modeLabel(selectedRecord.researchMode, language)}
              </strong>
            </span>
            <span aria-hidden="true" className="text-zinc-300">
              ·
            </span>
            <span>{categoriesLabel(selectedRecord, language)}</span>
            <span aria-hidden="true" className="text-zinc-300">
              ·
            </span>
            <span className="font-mono tabular-nums text-zinc-900">
              {selectedRecord.productCount}/{selectedRecord.requestedQuantity}{' '}
              {t.quantityProductsUnit}
            </span>
            <span aria-hidden="true" className="text-zinc-300">
              ·
            </span>
            <span className="font-mono tabular-nums">
              {t.estimatedCostLabel}:{' '}
              {selectedRecord.estimatedCredits !== null
                ? `${formatCredits(selectedRecord.estimatedCredits)} cr`
                : t.actualCostUnavailable}
            </span>
            <span aria-hidden="true" className="text-zinc-300">
              ·
            </span>
            <span className="font-mono tabular-nums text-emerald-700 font-medium">
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

        {/* Archived Product Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedProducts.map((product) => {
            const evalResult = selectedArchiveEvaluations.get(product.id);
            const compareKey = `history:${selectedRecord.id}:${product.id}`;
            return (
              <ResearchResultCard
                key={`${selectedRecord.id}-${product.id}`}
                product={product}
                evaluation={evalResult}
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
                    selectedRecord.products
                  )
                }
                language={language}
              />
            );
          })}
        </div>
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
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 transition-colors cursor-pointer py-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t.savedViewBackBtn}</span>
        </button>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-zinc-200">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <h1
                id="history-view-heading"
                className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950"
              >
                {t.historyViewTitle}
              </h1>
              <span className="font-mono text-sm text-zinc-500 tabular-nums">
                ({records.length})
              </span>
              <InfoPopover
                label={t.historyViewTitle}
                title={t.historyViewTitle}
                content={
                  <>
                    <p>{t.historyViewSubtitle}</p>
                    <p className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-100">
                      {t.historyStorageNote}
                    </p>
                  </>
                }
              />
            </div>
          </div>

          {/* Sub-Tabs: History Sessions | Compare Sessions */}
          <div
            className="inline-flex items-center p-1 bg-zinc-200/70 rounded-lg self-start md:self-auto shrink-0"
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
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
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
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
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
          className="p-4 bg-red-50/90 border border-red-200 rounded-xl flex items-start justify-between gap-3 text-xs text-red-900"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <div className="font-semibold">{t.historyQuotaWarningTitle}</div>
              <p className="mt-0.5 text-red-800 leading-relaxed">
                {isMy ? storageAlert.errorMy ?? storageAlert.errorEn : storageAlert.errorEn}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismissStorageAlert}
            aria-label={t.historyQuotaWarningDismiss}
            className="text-red-700 hover:text-red-950 p-1 rounded cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Local Storage Usage Monitor */}
      <div className="bg-white border border-zinc-200/90 rounded-xl p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-medium text-zinc-900">
            <HardDrive className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
            <span>{t.historyStorageUsageLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-600 tabular-nums">
            <span>
              History ({storageStats.historyCount}): {formatByteSize(storageStats.historyBytes)}
            </span>
            <span>
              Saved ({storageStats.savedCount}): {formatByteSize(storageStats.savedBytes)}
            </span>
            <span className="font-semibold text-zinc-950">
              {formatByteSize(storageStats.totalBytes)} /{' '}
              {formatByteSize(storageStats.estimatedQuotaBytes)} ({storageStats.usagePct}%)
            </span>
          </div>
        </div>
        <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              storageStats.usagePct >= 85
                ? 'bg-red-600'
                : storageStats.usagePct >= 60
                  ? 'bg-amber-500'
                  : 'bg-zinc-900'
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
        <div className="bg-white border border-zinc-200/90 rounded-xl px-6 py-16 text-center">
          <div className="w-11 h-11 rounded-xl bg-zinc-100 text-zinc-500 inline-flex items-center justify-center mb-4">
            <History className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="font-display text-base sm:text-lg font-semibold text-zinc-950">
            {t.historyEmptyTitle}
          </h2>
          <p className="mt-2 text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
            {t.historyEmptyDesc}
          </p>
          <button
            type="button"
            onClick={onBackToHunting}
            className="mt-6 inline-flex items-center gap-2 min-h-[42px] px-5 py-2 text-sm font-medium text-white bg-zinc-950 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>{t.savedViewBackBtn}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search, Filter, Sort & Selective Delete Controls */}
          <div className="bg-white border border-zinc-200/90 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Search */}
              <div className="md:col-span-5 relative">
                <Search
                  className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.historySearchPlaceholder}
                  aria-label={t.historySearchPlaceholder}
                  className="w-full min-h-[40px] pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border border-zinc-200 rounded-lg text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900"
                />
              </div>

              {/* Mode Filter */}
              <div className="md:col-span-2">
                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value as HistoryModeFilter)}
                  aria-label={t.researchModeLabel}
                  className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
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
                  className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
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
                  className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
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
              <div className="pt-3 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-mono text-zinc-700 tabular-nums">
                  {checkedIds.length} {t.historySelectedCount}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCheckedIds([])}
                    className="px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 cursor-pointer"
                  >
                    {t.confirmCancelBtn}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors cursor-pointer"
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
            <div className="bg-white border border-zinc-200/90 rounded-xl px-6 py-12 text-center">
              <p className="text-sm text-zinc-500">{t.emptyFilteredTitle}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((rec) => {
                const isChecked = checkedIds.includes(rec.id);
                const isConfirmingDelete = confirmDeleteId === rec.id;

                return (
                  <article
                    key={rec.id}
                    className="bg-white border border-zinc-200/90 rounded-xl p-4 sm:p-5 hover:border-zinc-300 transition-colors"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleChecked(rec.id)}
                          aria-label={`${t.historySelectLabel} ${rec.id}`}
                          className="mt-1 w-4 h-4 rounded-sm border-zinc-300 accent-zinc-950 cursor-pointer shrink-0"
                        />

                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <button
                              type="button"
                              onClick={() => {
                                setArchiveScoreMode('original');
                                setSelectedRecordId(rec.id);
                              }}
                              className="inline-flex items-center gap-1.5 font-display text-sm sm:text-base font-semibold text-zinc-950 hover:underline text-left cursor-pointer"
                            >
                              <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" aria-hidden="true" />
                              <span>{formatResearchDateTime(rec.researchedAt, language)}</span>
                            </button>
                            <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
                              {rec.id}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
                            <span className="font-medium text-zinc-900">
                              {modeLabel(rec.researchMode, language)}
                            </span>
                            <span aria-hidden="true" className="text-zinc-300">
                              ·
                            </span>
                            <span>{categoriesLabel(rec, language)}</span>
                            <span aria-hidden="true" className="text-zinc-300">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-zinc-900">
                              {rec.productCount} {t.quantityProductsUnit}
                            </span>
                            <span aria-hidden="true" className="text-zinc-300">
                              ·
                            </span>
                            <span className="font-mono tabular-nums">
                              {t.actualCostLabel}:{' '}
                              {rec.actualCredits !== null ? (
                                <strong className="text-emerald-700">
                                  {formatCredits(rec.actualCredits)} cr
                                </strong>
                              ) : (
                                <span className="text-zinc-400">{t.actualCostUnavailable}</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Row Actions */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0 pl-7 lg:pl-0">
                        <button
                          type="button"
                          onClick={() => {
                            setArchiveScoreMode('original');
                            setSelectedRecordId(rec.id);
                          }}
                          className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-white bg-zinc-950 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{t.historyViewResultsBtn}</span>
                        </button>

                        {records.length >= 2 && (
                          <button
                            type="button"
                            onClick={() => handleOpenCompareWith(rec)}
                            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:border-zinc-400 hover:text-zinc-950 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
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
                              className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                            >
                              {t.historyDeleteConfirmBtn}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 cursor-pointer whitespace-nowrap"
                            >
                              {t.confirmCancelBtn}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(rec.id)}
                            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-zinc-600 bg-white border border-zinc-200 hover:border-red-300 hover:text-red-700 hover:bg-red-50/40 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
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
