import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Calendar,
  ChevronDown,
  ExternalLink,
  Eye,
  GitCompareArrows,
  Globe,
  HardDrive,
  History,
  ImageOff,
  Layers,
  Link2,
  RotateCcw,
  Search,
  Trash2,
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
  SingleLinkResearchSource,
  SingleProductHistoryRecord,
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
import {
  formatThb,
  getTikTokShopProductUrl,
  normalizeTikTokSourceUrl,
  resolveProductImageDisplayConfig,
} from '../utils/format';
import { TRANSLATIONS } from '../i18n/translations';
import { ResearchResultCard } from './ResearchResultCard';
import { ResearchComparisonPanel } from './ResearchComparisonPanel';
import { ScoringRubricPanel } from './ScoringRubricPanel';
import { BestProductsStrip } from './BestProductsStrip';
import { ProductFilterBar } from './ProductFilterBar';
import { ProductImage } from './ProductImage';
import { InfoPopover } from './InfoPopover';
import { AnimatedNumber, StateMessage, StatusLegendPopover } from './visual';
import {
  MOTION_TRANSITIONS,
  MOTION_VARIANTS,
  TACTILE_INTERACTIONS,
} from '../utils/motionPresets';

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

export type HistoryTab = 'records' | 'single' | 'compare';
type HistoryModeFilter = 'all' | ResearchMode;
type HistorySortKey = 'newest' | 'oldest' | 'products-desc' | 'cost-desc' | 'cost-asc';
type SingleHistorySortKey = 'newest' | 'oldest' | 'score-desc' | 'commission-desc' | 'sales-desc';

interface ResearchHistoryViewProps {
  records: ResearchHistoryRecord[];
  singleRecords: SingleProductHistoryRecord[];
  initialTab?: HistoryTab;
  onTabChange?: (tab: HistoryTab) => void;
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
  onDeleteSingleRecords: (ids: string[]) => void;
  onOpenBackupRestore?: (tab: 'backup' | 'restore') => void;
  onBackToHunting: () => void;
  language: Language;
}

function singleSourceLabel(source: SingleLinkResearchSource, isMy: boolean): string {
  switch (source) {
    case 'kalodata-api':
      return isMy ? 'Kalodata API (တိုက်ရိုက်)' : 'Kalodata API (Live)';
    case 'server-cache':
      return isMy ? 'Server Cache (0 cr)' : 'Server Cache (0 cr)';
    case 'client-cache':
      return isMy ? 'Browser Cache (0 cr)' : 'Browser Cache (0 cr)';
    case 'in-flight-shared':
      return isMy ? 'Shared Request (0 cr)' : 'Shared Request (0 cr)';
    case 'existing-local-record':
      return isMy ? 'Local Record (0 cr)' : 'Local Record (0 cr)';
    case 'migrated-legacy':
      return isMy ? 'Migrated Record' : 'Migrated Record';
    default:
      return 'Kalodata';
  }
}

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
  singleRecords,
  initialTab = 'records',
  onTabChange,
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
  onDeleteSingleRecords,
  onOpenBackupRestore,
  onBackToHunting,
  language,
}: ResearchHistoryViewProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const prefersReduced = useReducedMotion();

  const [activeTab, setActiveTab] = useState<HistoryTab>(initialTab);
  useEffect(() => {
    setActiveTab(initialTab);
    setSelectedRecordId(null);
  }, [initialTab]);

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

  // Search, Filter & Sort state for Batch History List
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<HistoryModeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortKey, setSortKey] = useState<HistorySortKey>('newest');

  // Selective deletion & expandable product preview state for Batch History
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedSessionIds, setExpandedSessionIds] = useState<string[]>([]);

  const toggleSessionExpanded = (id: string) => {
    setExpandedSessionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Search, Filter, Sort & Selective deletion state for Single Product History
  const [singleSearchQuery, setSingleSearchQuery] = useState('');
  const [singleCategoryFilter, setSingleCategoryFilter] = useState<CategoryFilter>('all');
  const [singleSortKey, setSingleSortKey] = useState<SingleHistorySortKey>('newest');
  const [checkedSingleIds, setCheckedSingleIds] = useState<string[]>([]);
  const [confirmDeleteSingleId, setConfirmDeleteSingleId] = useState<string | null>(null);

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
    () => getLocalStorageUsageStats(records.length, savedCount, singleRecords.length),
    [records, savedCount, singleRecords]
  );

  const recordVerdictCounts = useMemo(() => {
    const map = new Map<
      string,
      {
        recommended: number;
        'worth-testing': number;
        'need-more-data': number;
        'not-recommended': number;
        total: number;
      }
    >();

    for (const rec of records) {
      const counts = {
        recommended: 0,
        'worth-testing': 0,
        'need-more-data': 0,
        'not-recommended': 0,
        total: rec.products.length,
      };
      const weight = rec.researchSettings.salesWeightPct ?? 50;

      for (const product of rec.products) {
        const snap = rec.scoreSnapshots?.[product.id];
        let ev: OpportunityEvaluation;
        if (snap && Array.isArray(snap.criteria) && snap.criteria.length === 7) {
          const baseEval = evaluateProductOpportunity(product, {
            salesWeightPct: snap.salesWeightPct,
            strategyPreset: snap.strategyPreset,
            peerProducts: rec.products,
          });
          ev = {
            ...baseEval,
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
          };
        } else {
          ev = evaluateProductOpportunity(product, {
            salesWeightPct: weight,
            peerProducts: rec.products,
          });
        }

        const verdict = deriveProductDecisionSummary(product, ev).verdict;
        counts[verdict] += 1;
      }

      map.set(rec.id, counts);
    }

    return map;
  }, [records]);

  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedRecordId) ?? null,
    [records, selectedRecordId]
  );

  const filteredSingleRecords = useMemo(() => {
    const q = singleSearchQuery.trim().toLowerCase();
    const filtered = singleRecords.filter((rec) => {
      if (singleCategoryFilter !== 'all' && rec.product.category !== singleCategoryFilter) {
        return false;
      }
      if (!q) return true;
      const p = rec.product;
      return (
        p.name.toLowerCase().includes(q) ||
        p.nameMy.toLowerCase().includes(q) ||
        p.shopName.toLowerCase().includes(q) ||
        rec.canonicalProductId.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.kalodataMetrics?.productId ?? '').toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      const timeA = Date.parse(a.researchedAt) || 0;
      const timeB = Date.parse(b.researchedAt) || 0;
      switch (singleSortKey) {
        case 'newest':
          return timeB - timeA;
        case 'oldest':
          return timeA - timeB;
        case 'score-desc':
          return (b.scoreSnapshot?.totalScore ?? 0) - (a.scoreSnapshot?.totalScore ?? 0) || timeB - timeA;
        case 'commission-desc': {
          const commA =
            a.product.commissionVerified && typeof a.product.commissionRate === 'number'
              ? a.product.commissionRate
              : a.product.kalodataMetrics?.commissionRatePct ?? -1;
          const commB =
            b.product.commissionVerified && typeof b.product.commissionRate === 'number'
              ? b.product.commissionRate
              : b.product.kalodataMetrics?.commissionRatePct ?? -1;
          return commB - commA || timeB - timeA;
        }
        case 'sales-desc':
          return (
            (b.product.kalodataMetrics?.salesVolume ?? -1) -
              (a.product.kalodataMetrics?.salesVolume ?? -1) || timeB - timeA
          );
        default:
          return 0;
      }
    });
  }, [singleRecords, singleSearchQuery, singleCategoryFilter, singleSortKey]);

  const toggleSingleChecked = (id: string) => {
    setCheckedSingleIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteSelectedSingle = () => {
    if (checkedSingleIds.length === 0) return;
    onDeleteSingleRecords(checkedSingleIds);
    setCheckedSingleIds([]);
  };

  const handleDeleteSingleItem = (id: string) => {
    onDeleteSingleRecords([id]);
    setConfirmDeleteSingleId(null);
    setCheckedSingleIds((prev) => prev.filter((item) => item !== id));
  };

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

  // Read-only rank by totalScore across the FULL archive batch (ignores filters and tabs; ties share a rank)
  const archiveBatchScoreRanks = useMemo(() => {
    const batchProducts = selectedRecord?.products ?? [];
    const total = batchProducts.length;
    const ranks = new Map<string, { rank: number; total: number }>();
    if (total === 0) return ranks;
    const entries = batchProducts.map((product) => ({
      id: product.id,
      score: selectedArchiveEvaluations.get(product.id)?.totalScore ?? null,
    }));
    for (const entry of entries) {
      if (entry.score === null) continue;
      let higherCount = 0;
      for (const peer of entries) {
        if (peer.score !== null && peer.score > entry.score) {
          higherCount += 1;
        }
      }
      ranks.set(entry.id, { rank: higherCount + 1, total });
    }
    return ranks;
  }, [selectedRecord, selectedArchiveEvaluations]);

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
      <section aria-labelledby="archive-detail-heading" className="space-y-4 sm:space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          <motion.button
            type="button"
            onClick={() => setSelectedRecordId(null)}
            whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
            transition={MOTION_TRANSITIONS.snappy}
            className="sp-btn-ghost -ml-2"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t.historyBackToListBtn}</span>
          </motion.button>

          <div className="flex flex-wrap items-center gap-2">
            {records.length >= 2 && (
              <motion.button
                type="button"
                onClick={() => handleOpenCompareWith(selectedRecord)}
                whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                transition={MOTION_TRANSITIONS.snappy}
                className="sp-btn-secondary px-3 py-1.5"
              >
                <GitCompareArrows className="w-3.5 h-3.5 shrink-0 text-cyan-600 dark:text-[#25F4EE]" aria-hidden="true" />
                <span>{t.historyCompareBtn}</span>
              </motion.button>
            )}
          </div>
        </div>

        {/* Immutable Archived Snapshot Banner */}
        <div className="sp-card p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3.5 sm:gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {t.historyArchiveBannerTitle}
                </span>
                <InfoPopover
                  label={t.historyArchiveBannerTitle}
                  title={t.historyArchiveBannerTitle}
                  content={
                    <div className="space-y-1.5">
                      <p>{t.historyArchiveBannerDesc}</p>
                      <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                        {t.historyRecordIdLabel}: {selectedRecord.id}
                      </p>
                    </div>
                  }
                />
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                <h1
                  id="archive-detail-heading"
                  className={`font-display text-xl sm:text-2xl font-bold text-zinc-950 dark:text-zinc-50 ${
                    isMy ? 'tracking-normal leading-[1.3]' : 'leading-[1.25]'
                  }`}
                >
                  {formatResearchDateTime(selectedRecord.researchedAt, language)}
                </h1>
                <span className="font-mono text-xs text-emerald-600 dark:text-[#10F5A0] tabular-nums font-semibold">
                  (<AnimatedNumber value={visibleArchiveProducts.length} />/
                  <AnimatedNumber value={selectedRecord.products.length} />)
                </span>
                <StatusLegendPopover language={language} />
              </div>
            </div>

            {/* Score View Mode Switch (Original Session Scores vs Interactive Strategy Slider) */}
            <div
              className="sp-segmented flex-wrap max-w-full self-start"
              role="group"
              aria-label="Score view mode"
            >
              {(
                [
                  { id: 'original' as const, label: t.historyScoreModeOriginal },
                  {
                    id: 'live' as const,
                    label: `${t.historyScoreModeLive} (${archiveLiveWeightPct}/${100 - archiveLiveWeightPct})`,
                  },
                ] as const
              ).map((modeOption) => {
                const isActive = archiveScoreMode === modeOption.id;
                return (
                  <motion.button
                    key={modeOption.id}
                    type="button"
                    onClick={() => setArchiveScoreMode(modeOption.id)}
                    whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                    transition={MOTION_TRANSITIONS.snappy}
                    className={`relative sp-segmented-item max-w-full whitespace-normal sm:whitespace-nowrap text-left leading-snug ${
                      isActive
                        ? 'text-zinc-950 dark:text-zinc-50'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="archive-score-mode-pill"
                        transition={MOTION_TRANSITIONS.snappy}
                        aria-hidden="true"
                        className="absolute inset-0 rounded-lg bg-[var(--sp-surface)] dark:bg-[#1A2130] border border-[var(--sp-border-strong)] shadow-xs"
                      />
                    )}
                    <span className="relative z-10">{modeOption.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--sp-border)] flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
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
            <span className="font-mono tabular-nums text-emerald-600 dark:text-[#10F5A0] font-semibold">
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

        {/* Unified 7-Factor Product Scoring Engine & Commission Strategy Control (Matches Research Results) */}
        <ScoringRubricPanel
          className="mt-0"
          isOpen={archiveRubricOpen}
          onToggle={() => setArchiveRubricOpen((prev) => !prev)}
          salesWeightPct={effectiveArchiveSalesWeightPct}
          strategyPreset={effectiveArchiveStrategyPreset}
          onSelectStrategyPreset={handleArchiveSelectPreset}
          onCustomWeightChange={handleArchiveCustomWeightChange}
          showStrategyControls={selectedRecord.products.length > 0}
          language={language}
        />

        {/* Kalodata OpenAPI Verified Sources & API Call Breakdown Accordion (Matches Research Results) */}
        {hasSourcesOrCostBar && (
          <div className="sp-card overflow-hidden">
            <motion.button
              type="button"
              onClick={() => setArchiveGroundingOpen((prev) => !prev)}
              aria-expanded={archiveGroundingOpen}
              whileTap={prefersReduced ? undefined : { scale: 0.995 }}
              transition={MOTION_TRANSITIONS.snappy}
              className="w-full min-h-[48px] px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2.5 text-left hover:bg-zinc-100/60 dark:hover:bg-white/[0.03] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 dark:focus-visible:ring-[#10F5A0]"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Globe
                  className="w-4 h-4 text-emerald-600 dark:text-[#10F5A0] shrink-0"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 leading-snug">
                    {t.kalodataSourceBarLabel}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
                    <span className="font-mono tabular-nums">
                      {selectedRecord.productCount}/{selectedRecord.requestedQuantity}{' '}
                      {t.qualityGateVerifiedLabel}
                    </span>
                    {archiveCostSummary && archiveCostSummary.actualCredits !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-emerald-600 dark:text-[#10F5A0] font-semibold whitespace-nowrap">
                          {formatCredits(archiveCostSummary.actualCredits)} {t.creditsUnit}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 shrink-0 whitespace-nowrap">
                <span className="hidden sm:inline">
                  {archiveGroundingOpen ? t.groundingToggleHide : t.groundingToggleShow}
                </span>
                <motion.span
                  animate={{ rotate: archiveGroundingOpen ? 180 : 0 }}
                  transition={MOTION_TRANSITIONS.snappy}
                  className="inline-flex"
                  aria-hidden="true"
                >
                  <ChevronDown className="w-4 h-4 shrink-0" />
                </motion.span>
              </span>
            </motion.button>

            <AnimatePresence initial={false}>
              {archiveGroundingOpen && (
                <motion.div
                  key="archive-grounding-body"
                  initial={prefersReduced ? { opacity: 1 } : { height: 0, opacity: 0 }}
                  animate={{
                    height: 'auto',
                    opacity: 1,
                    transitionEnd: { overflow: 'visible' },
                  }}
                  exit={
                    prefersReduced
                      ? { opacity: 0 }
                      : { height: 0, opacity: 0, overflow: 'hidden' }
                  }
                  transition={MOTION_TRANSITIONS.accordion}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="border-t border-[var(--sp-border)] px-4 sm:px-5 pb-4 pt-3 space-y-3">
                    <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                      <p>{t.kalodataSourceNote}</p>
                      {selectedRecord.productCount < selectedRecord.requestedQuantity && (
                        <p className="text-zinc-500 dark:text-zinc-400">
                          {t.qualityGateExcludedNote}
                        </p>
                      )}
                    </div>

                    {archiveCostSummary && (
                      <div className="sp-surface-muted px-3.5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
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
                          <span className="font-sans text-emerald-600 dark:text-[#10F5A0] font-medium">
                            {t.geminiAnalysisActiveLabel}
                          </span>
                        )}
                        <span>
                          {t.estimatedCostLabel}: {formatCredits(archiveCostSummary.estimatedCredits)}{' '}
                          {t.creditsUnit} (≈ {formatUsd(archiveCostSummary.estimatedUsd)})
                        </span>
                        <span className="text-emerald-600 dark:text-[#10F5A0] font-semibold">
                          {t.actualCostLabel}:{' '}
                          {archiveCostSummary.actualCredits !== null
                            ? `${formatCredits(archiveCostSummary.actualCredits)} ${t.creditsUnit} (≈ ${formatUsd(archiveCostSummary.actualUsd ?? 0)} · ${archiveCostSummary.actualApiCalls} ${t.actualCallsLabel})`
                            : t.actualCostUnavailable}
                        </span>
                      </div>
                    )}

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
                              className="flex items-center justify-between gap-2 py-1 border-b border-[var(--sp-border)] text-xs"
                            >
                              <span className="text-zinc-700 dark:text-zinc-300 truncate">
                                {src.title}{' '}
                                <span className="text-zinc-500 dark:text-zinc-400">({src.domain})</span>
                              </span>
                              {resolvedHref ? (
                                <a
                                  href={resolvedHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 font-medium text-cyan-700 dark:text-[#25F4EE] hover:underline whitespace-nowrap shrink-0"
                                >
                                  <span>{t.sourceOpenLink}</span>
                                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                </a>
                              ) : (
                                <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap shrink-0">
                                  {t.sourcePendingLink}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
            products={selectedRecord.products}
            evaluations={selectedArchiveEvaluations}
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
          <StateMessage
            variant="empty"
            icon={<Search className="w-5 h-5" aria-hidden="true" />}
            title={t.emptyFilteredTitle}
            reason={t.emptyFilteredDesc}
            actionLabel={t.resetViewBtn}
            actionIcon={<RotateCcw className="w-4 h-4" aria-hidden="true" />}
            onAction={() => {
              setArchiveFilters({ ...DEFAULT_PRODUCT_FILTERS });
              setArchiveDecisionFilter('active');
            }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
            {visibleArchiveProducts.map((product, idx) => {
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
                  rankInfo={archiveBatchScoreRanks.get(product.id)}
                  entranceIndex={idx}
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

  const storageBarTone =
    storageStats.usagePct >= 85
      ? 'bg-rose-600 dark:bg-[#FE2C55]'
      : storageStats.usagePct >= 70
        ? 'bg-amber-500 dark:bg-amber-400'
        : 'bg-emerald-500 dark:bg-[#10F5A0]';

  const storagePctTextTone =
    storageStats.usagePct >= 85
      ? 'text-rose-600 dark:text-[#FE2C55]'
      : storageStats.usagePct >= 70
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-emerald-600 dark:text-[#10F5A0]';

  const storageFillScale = Math.max(0.015, Math.min(1, storageStats.usagePct / 100));

  const historyTabs: Array<{
    id: HistoryTab;
    label: string;
    count?: number;
    icon: typeof History;
    activeIconClass: string;
  }> = [
    {
      id: 'records',
      label: t.historyTabRecords,
      count: records.length,
      icon: History,
      activeIconClass: 'text-emerald-600 dark:text-[#10F5A0]',
    },
    {
      id: 'single',
      label: t.historyTabSingle,
      count: singleRecords.length,
      icon: Link2,
      activeIconClass: 'text-cyan-600 dark:text-[#25F4EE]',
    },
    {
      id: 'compare',
      label: t.historyTabCompare,
      icon: GitCompareArrows,
      activeIconClass: 'text-cyan-600 dark:text-[#25F4EE]',
    },
  ];

  return (
    <section aria-labelledby="history-view-heading" className="space-y-5 sm:space-y-6">
      {/* Header & Back Navigation */}
      <div className="space-y-3 sm:space-y-4">
        <motion.button
          type="button"
          onClick={onBackToHunting}
          whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
          transition={MOTION_TRANSITIONS.snappy}
          className="sp-btn-ghost -ml-2"
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{t.savedViewBackBtn}</span>
        </motion.button>

        <div className="sp-card p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-3.5 sm:gap-4">
          <div className="min-w-0 flex-1 max-w-2xl">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <h1
                id="history-view-heading"
                className={`font-display text-xl sm:text-2xl font-bold text-zinc-950 dark:text-zinc-50 ${
                  isMy ? 'tracking-normal leading-[1.3]' : 'tracking-tight leading-[1.2]'
                }`}
              >
                {t.historyViewTitle}
              </h1>
              <span
                className={`font-mono text-sm font-semibold tabular-nums shrink-0 ${
                  activeTab === 'single'
                    ? 'text-cyan-600 dark:text-[#25F4EE]'
                    : 'text-emerald-600 dark:text-[#10F5A0]'
                }`}
              >
                (<AnimatedNumber value={activeTab === 'single' ? singleRecords.length : records.length} />)
              </span>
              <InfoPopover
                label={t.historyViewTitle}
                title={t.historyViewTitle}
                content={
                  <>
                    <p>{activeTab === 'single' ? t.singleHistorySubtitle : t.historyViewSubtitle}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 pt-1 border-t border-[var(--sp-border)]">
                      {t.historyStorageNote}
                    </p>
                  </>
                }
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {activeTab === 'single' ? t.singleHistorySubtitle : t.historyViewSubtitle}
            </p>
          </div>

          {/* Gliding History Section Tabs */}
          <div className="relative max-w-full min-w-0 self-stretch xl:self-auto">
            <div
              className="sp-segmented flex max-w-full pr-7 sm:pr-1 overflow-x-auto no-scrollbar"
              role="tablist"
              aria-label={t.historyViewTitle}
            >
              {historyTabs.map((tab) => {
                const Icon = tab.icon;
                const isSelected = activeTab === tab.id;
                return (
                  <motion.button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => {
                      setActiveTab(tab.id);
                      onTabChange?.(tab.id);
                    }}
                    whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                    transition={MOTION_TRANSITIONS.snappy}
                    className={`relative sp-segmented-item shrink-0 ${
                      isSelected
                        ? 'text-zinc-950 dark:text-zinc-50'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                    }`}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="history-view-tab-pill"
                        transition={MOTION_TRANSITIONS.snappy}
                        aria-hidden="true"
                        className="absolute inset-0 rounded-lg bg-[var(--sp-surface)] dark:bg-[#1A2130] border border-[var(--sp-border-strong)] shadow-xs"
                      />
                    )}
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      <Icon
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? tab.activeIconClass : ''
                        }`}
                        aria-hidden="true"
                      />
                      <span>{tab.label}</span>
                      {typeof tab.count === 'number' && (
                        <span className="font-mono text-xs tabular-nums opacity-80">
                          (<AnimatedNumber value={tab.count} />)
                        </span>
                      )}
                    </span>
                  </motion.button>
                );
              })}
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-gradient-to-l from-[var(--sp-surface)] to-transparent sm:hidden"
            />
          </div>
        </div>
      </div>

      {/* Quota Exceeded / Storage Warning Banner */}
      {storageAlert && !storageAlert.ok && (
        <StateMessage
          variant="error"
          compact
          icon={<AlertTriangle className="w-4 h-4" aria-hidden="true" />}
          title={t.historyQuotaWarningTitle}
          reason={
            isMy
              ? (storageAlert.errorMy ?? storageAlert.errorEn ?? t.historyQuotaWarningTitle)
              : (storageAlert.errorEn ?? t.historyQuotaWarningTitle)
          }
          actionLabel={t.historyQuotaWarningDismiss}
          onAction={onDismissStorageAlert}
        />
      )}

      {/* Active Tab Content with Smooth Cross-Fade */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          initial={prefersReduced ? { opacity: 1 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={MOTION_TRANSITIONS.crossFade}
        >
          {activeTab === 'compare' ? (
            <ResearchComparisonPanel
              historyRecords={records}
              initialOlderId={compareOlderId}
              initialNewerId={compareNewerId}
              onOpenProductReport={(product, researchDate) => onOpenReport(product, researchDate)}
              language={language}
            />
          ) : activeTab === 'single' ? (
            <div className="space-y-4">
              {singleRecords.length === 0 ? (
                <StateMessage
                  variant="empty"
                  icon={<Link2 className="w-5 h-5" aria-hidden="true" />}
                  title={t.singleHistoryEmptyTitle}
                  reason={t.singleHistoryEmptyDesc}
                  actionLabel={t.savedViewBackBtn}
                  actionIcon={<ArrowLeft className="w-4 h-4" aria-hidden="true" />}
                  onAction={onBackToHunting}
                />
              ) : (
                <>
                  {/* Search, Category Filter, Sort & Selective Delete Controls */}
                  <div className="sp-card p-3.5 sm:p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 sm:gap-3">
                      <div className="sm:col-span-2 lg:col-span-6 relative">
                        <Search
                          className="w-4 h-4 text-zinc-500 dark:text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          type="search"
                          value={singleSearchQuery}
                          onChange={(e) => setSingleSearchQuery(e.target.value)}
                          placeholder={t.singleHistorySearchPlaceholder}
                          aria-label={t.singleHistorySearchPlaceholder}
                          className="w-full min-h-[40px] pl-9 pr-3 py-2 text-xs sm:text-sm bg-[var(--sp-surface-muted)] dark:bg-[#131823] border border-[var(--sp-border-strong)] rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:border-cyan-500 dark:focus:border-[#25F4EE] transition-colors"
                        />
                      </div>

                      <div className="lg:col-span-3">
                        <select
                          value={singleCategoryFilter}
                          onChange={(e) => setSingleCategoryFilter(e.target.value as CategoryFilter)}
                          aria-label={t.settingCategoryLabel}
                          className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-[var(--sp-surface-muted)] dark:bg-[#131823] border border-[var(--sp-border-strong)] rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-cyan-500 dark:focus:border-[#25F4EE] cursor-pointer transition-colors"
                        >
                          <option value="all">{t.categoryAll}</option>
                          {UNIVERSAL_CATEGORIES.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {getCategoryLabel(cat.id, language)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="lg:col-span-3">
                        <select
                          value={singleSortKey}
                          onChange={(e) => setSingleSortKey(e.target.value as SingleHistorySortKey)}
                          aria-label={t.sortLabel}
                          className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-[var(--sp-surface-muted)] dark:bg-[#131823] border border-[var(--sp-border-strong)] rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-cyan-500 dark:focus:border-[#25F4EE] cursor-pointer transition-colors"
                        >
                          <option value="newest">{t.historySortNewest}</option>
                          <option value="oldest">{t.historySortOldest}</option>
                          <option value="score-desc">{t.sortFieldLabels.overallScore}</option>
                          <option value="commission-desc">{t.sortFieldLabels.commissionPotential}</option>
                          <option value="sales-desc">{t.sortFieldLabels.salesPerformance}</option>
                        </select>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {checkedSingleIds.length > 0 && (
                        <motion.div
                          key="single-bulk-delete"
                          initial={prefersReduced ? { opacity: 1 } : { height: 0, opacity: 0 }}
                          animate={{
                            height: 'auto',
                            opacity: 1,
                            transitionEnd: { overflow: 'visible' },
                          }}
                          exit={
                            prefersReduced
                              ? { opacity: 0 }
                              : { height: 0, opacity: 0, overflow: 'hidden' }
                          }
                          transition={MOTION_TRANSITIONS.accordion}
                          style={{ overflow: 'hidden' }}
                        >
                          <div className="pt-3 border-t border-[var(--sp-border)] flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-mono text-zinc-700 dark:text-zinc-300 tabular-nums">
                              <AnimatedNumber value={checkedSingleIds.length} /> {t.historySelectedCount}
                            </span>
                            <div className="flex items-center gap-2">
                              <motion.button
                                type="button"
                                onClick={() => setCheckedSingleIds([])}
                                whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                                transition={MOTION_TRANSITIONS.snappy}
                                className="sp-btn-ghost px-3"
                              >
                                {t.confirmCancelBtn}
                              </motion.button>
                              <motion.button
                                type="button"
                                onClick={handleDeleteSelectedSingle}
                                whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                                transition={MOTION_TRANSITIONS.snappy}
                                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 dark:bg-[#FE2C55] hover:bg-rose-700 dark:hover:brightness-110 rounded-xl transition-[filter,background-color] cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>
                                  {t.historyDeleteSelectedBtn} ({checkedSingleIds.length})
                                </span>
                              </motion.button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {filteredSingleRecords.length === 0 ? (
                    <StateMessage
                      variant="empty"
                      icon={<Search className="w-5 h-5" aria-hidden="true" />}
                      reason={t.emptyFilteredTitle}
                      actionLabel={t.savedResetFiltersBtn}
                      actionIcon={<RotateCcw className="w-4 h-4" aria-hidden="true" />}
                      onAction={() => {
                        setSingleSearchQuery('');
                        setSingleCategoryFilter('all');
                      }}
                    />
                  ) : (
                    <div className="space-y-3">
                      {filteredSingleRecords.map((rec, idx) => {
                        const p = rec.product;
                        const isChecked = checkedSingleIds.includes(rec.id);
                        const isConfirming = confirmDeleteSingleId === rec.id;
                        const isSaved = getDecision(p.id) === 'saved';
                        const imgConfig = resolveProductImageDisplayConfig(p);
                        const evalResult = evaluateProductOpportunity(p, {
                          salesWeightPct: currentSalesWeightPct,
                        });
                        const verifiedCommRate =
                          p.commissionVerified && typeof p.commissionRate === 'number'
                            ? p.commissionRate
                            : null;
                        const fallbackCommRate =
                          verifiedCommRate === null &&
                          typeof p.kalodataMetrics?.commissionRatePct === 'number'
                            ? p.kalodataMetrics.commissionRatePct
                            : null;
                        const derivedTiktokUrl = getTikTokShopProductUrl(p);
                        const tiktokHref =
                          rec.canonicalUrl ??
                          (isSafeHttpUrl(derivedTiktokUrl) ? derivedTiktokUrl : null);

                        return (
                          <motion.article
                            key={rec.id}
                            variants={prefersReduced ? undefined : MOTION_VARIANTS.cardReveal}
                            custom={idx}
                            initial={prefersReduced ? false : 'initial'}
                            animate="animate"
                            whileHover={prefersReduced ? undefined : TACTILE_INTERACTIONS.cardHover}
                            className="sp-card p-3.5 sm:p-5 hover:border-cyan-500/40 dark:hover:border-[#25F4EE]/30"
                          >
                            <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3.5 sm:gap-4">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleSingleChecked(rec.id)}
                                  aria-label={`${t.historySelectLabel} ${p.name}`}
                                  className="mt-1 w-4 h-4 rounded-sm border-[var(--sp-border-strong)] accent-cyan-600 dark:accent-[#25F4EE] cursor-pointer shrink-0"
                                />

                                <div className="w-16 h-16 rounded-xl overflow-hidden bg-[var(--sp-surface-muted)] border border-[var(--sp-border)] shrink-0">
                                  {imgConfig.canRender && imgConfig.src ? (
                                    <ProductImage
                                      src={imgConfig.src}
                                      fallbackSrc={imgConfig.fallbackSrc}
                                      productId={imgConfig.productId}
                                      alt={p.name}
                                      title={isMy ? p.nameMy : p.name}
                                      unavailableLabel={t.cardImageUnverified}
                                      compact
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <ImageOff className="w-4 h-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1 space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                                    <span className="font-semibold text-cyan-700 dark:text-[#25F4EE]">
                                      {getCategoryLabel(p.category, language, { short: true })}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    <span>{formatResearchDateTime(rec.researchedAt, language)}</span>
                                  </div>

                                  <h3
                                    title={`${t.historyRecordIdLabel}: ${rec.canonicalProductId}`}
                                    className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2"
                                  >
                                    {isMy ? p.nameMy : p.name}
                                  </h3>

                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                                    <span>
                                      {t.linkImportShopLabel}:{' '}
                                      <strong className="font-medium text-zinc-900 dark:text-zinc-100">
                                        {p.shopName || t.dataStatusLabels.unavailable}
                                      </strong>
                                    </span>
                                    <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                                      ·
                                    </span>
                                    <span>
                                      {t.singleHistorySourceLabel}:{' '}
                                      <strong className="font-mono text-cyan-700 dark:text-[#25F4EE]">
                                        {singleSourceLabel(rec.dataSource, isMy)}
                                      </strong>
                                    </span>
                                    <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                                      ·
                                    </span>
                                    <span className="font-mono tabular-nums">
                                      {t.singleHistoryCreditsLabel}: {formatCredits(rec.estimatedCreditsCharged)} cr
                                    </span>
                                    <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                                      ·
                                    </span>
                                    <span className="font-mono text-xs tabular-nums text-emerald-600 dark:text-[#10F5A0]">
                                      {evalResult.verifiedCount} {t.bestVerifiedUnit} · {evalResult.unavailableCount}{' '}
                                      {t.dataStatusLabels.unavailable}
                                    </span>
                                  </div>

                                  <div className="sp-surface-muted p-2.5 sm:p-3 grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3 mt-1 text-xs">
                                    <div className="min-w-0">
                                      <span className="text-xs text-zinc-500 dark:text-zinc-400 block">
                                        {t.linkImportPriceLabel}
                                      </span>
                                      <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                                        {typeof p.priceThb === 'number'
                                          ? formatThb(p.priceThb)
                                          : t.dataStatusLabels.unavailable}
                                      </span>
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-xs text-zinc-500 dark:text-zinc-400 block">
                                        {t.linkImportSalesLabel}
                                      </span>
                                      <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                                        {typeof p.kalodataMetrics?.salesVolume === 'number' ? (
                                          <AnimatedNumber value={p.kalodataMetrics.salesVolume} />
                                        ) : (
                                          t.dataStatusLabels.unavailable
                                        )}
                                      </span>
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-xs text-zinc-500 dark:text-zinc-400 block">
                                        {t.linkImportRevenueLabel}
                                      </span>
                                      <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                                        {typeof p.kalodataMetrics?.revenueThb === 'number'
                                          ? formatThb(p.kalodataMetrics.revenueThb)
                                          : t.dataStatusLabels.unavailable}
                                      </span>
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-xs text-zinc-500 dark:text-zinc-400 block">
                                        {t.linkImportCommissionLabel}
                                      </span>
                                      {verifiedCommRate !== null ? (
                                        <AnimatedNumber
                                          value={verifiedCommRate}
                                          decimals={1}
                                          suffix="%"
                                          highlightSignal={
                                            verifiedCommRate >= 10 ? 'emerald-sheen' : 'none'
                                          }
                                          className="font-mono font-semibold text-emerald-600 dark:text-[#10F5A0]"
                                        />
                                      ) : fallbackCommRate !== null ? (
                                        <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
                                          {fallbackCommRate.toFixed(1)}%
                                        </span>
                                      ) : (
                                        <span className="font-mono text-zinc-500 dark:text-zinc-400">
                                          {t.dataStatusLabels.unavailable}
                                        </span>
                                      )}
                                    </div>
                                    <div className="col-span-2 sm:col-span-1 min-w-0">
                                      <span className="text-xs text-zinc-500 dark:text-zinc-400 block">
                                        {t.linkImportScoreLabel}
                                      </span>
                                      <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                                        <AnimatedNumber value={evalResult.totalScore} />/100 ({t.confidenceLabels[evalResult.confidenceLevel]})
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Row Actions */}
                              <div className="flex flex-wrap items-center gap-2 pl-7 xl:pl-0 xl:justify-end xl:max-w-[430px]">
                                <motion.button
                                  type="button"
                                  onClick={() =>
                                    onOpenReport(p, rec.researchedAt, evalResult, [p], 'fast')
                                  }
                                  whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                                  transition={MOTION_TRANSITIONS.snappy}
                                  className="sp-btn-volt px-3 py-1.5 text-xs"
                                >
                                  <span>{t.singleHistoryOpenReportBtn}</span>
                                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                </motion.button>

                                {onOpenDeepDive && (
                                  <motion.button
                                    type="button"
                                    onClick={() => onOpenDeepDive(p, rec.researchedAt, 'fast')}
                                    whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                                    transition={MOTION_TRANSITIONS.snappy}
                                    className="inline-flex items-center justify-center gap-1.5 min-h-[40px] max-w-full px-3 py-1.5 text-xs font-semibold text-cyan-800 dark:text-[#25F4EE] bg-cyan-500/[0.08] dark:bg-[#25F4EE]/[0.1] border border-cyan-500/35 dark:border-[#25F4EE]/30 hover:bg-cyan-500/[0.15] dark:hover:bg-[#25F4EE]/[0.16] rounded-xl transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:focus-visible:ring-[#25F4EE]"
                                  >
                                    <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                    <span>{t.singleHistoryDeepDiveBtn}</span>
                                  </motion.button>
                                )}

                                <motion.button
                                  type="button"
                                  onClick={() => onSaveProduct(p, rec.researchedAt)}
                                  whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                                  transition={MOTION_TRANSITIONS.snappy}
                                  className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:focus-visible:ring-[#10F5A0] ${
                                    isSaved
                                      ? 'bg-emerald-500/[0.1] dark:bg-[#10F5A0]/[0.12] text-emerald-700 dark:text-[#10F5A0] border-emerald-500/40 dark:border-[#10F5A0]/40'
                                      : 'bg-[var(--sp-surface)] text-zinc-700 dark:text-zinc-200 border-[var(--sp-border-strong)] hover:border-zinc-400 dark:hover:border-white/25'
                                  }`}
                                >
                                  <Bookmark
                                    className={`w-3.5 h-3.5 shrink-0 ${isSaved ? 'fill-current' : ''}`}
                                    aria-hidden="true"
                                  />
                                  <span>{isSaved ? t.linkImportSavedBtn : t.linkImportSaveBtn}</span>
                                </motion.button>

                                {tiktokHref && (
                                  <a
                                    href={tiktokHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="sp-btn-ghost px-2.5"
                                  >
                                    <span>{t.singleHistoryOpenLinkBtn}</span>
                                    <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                                  </a>
                                )}

                                {isConfirming ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <motion.button
                                      type="button"
                                      onClick={() => handleDeleteSingleItem(rec.id)}
                                      whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                                      transition={MOTION_TRANSITIONS.snappy}
                                      className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 dark:bg-[#FE2C55] hover:bg-rose-700 dark:hover:brightness-110 rounded-xl transition-[filter,background-color] cursor-pointer whitespace-nowrap"
                                    >
                                      {t.historyDeleteConfirmBtn}
                                    </motion.button>
                                    <motion.button
                                      type="button"
                                      onClick={() => setConfirmDeleteSingleId(null)}
                                      whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                                      transition={MOTION_TRANSITIONS.snappy}
                                      className="sp-btn-ghost px-2.5"
                                    >
                                      {t.confirmCancelBtn}
                                    </motion.button>
                                  </div>
                                ) : (
                                  <motion.button
                                    type="button"
                                    onClick={() => setConfirmDeleteSingleId(rec.id)}
                                    whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                                    transition={MOTION_TRANSITIONS.snappy}
                                    className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-[var(--sp-surface)] border border-[var(--sp-border-strong)] hover:border-rose-400/70 dark:hover:border-[#FE2C55]/50 hover:text-rose-600 dark:hover:text-[#FE2C55] hover:bg-rose-50/50 dark:hover:bg-[#FE2C55]/[0.08] rounded-xl transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:focus-visible:ring-[#FE2C55]"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                    <span>{t.historyDeleteBtn}</span>
                                  </motion.button>
                                )}
                              </div>
                            </div>
                          </motion.article>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : records.length === 0 ? (
            <StateMessage
              variant="empty"
              icon={<History className="w-5 h-5" aria-hidden="true" />}
              title={t.historyEmptyTitle}
              reason={t.historyEmptyDesc}
              actionLabel={t.savedViewBackBtn}
              actionIcon={<ArrowLeft className="w-4 h-4" aria-hidden="true" />}
              onAction={onBackToHunting}
            />
          ) : (
            <div className="space-y-4">
              {/* Search, Filter, Sort & Selective Delete Controls */}
              <div className="sp-card p-3.5 sm:p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-2.5 sm:gap-3">
                  {/* Search */}
                  <div className="sm:col-span-2 xl:col-span-4 relative">
                    <Search
                      className="w-4 h-4 text-zinc-500 dark:text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t.historySearchPlaceholder}
                      aria-label={t.historySearchPlaceholder}
                      className="w-full min-h-[40px] pl-9 pr-3 py-2 text-xs sm:text-sm bg-[var(--sp-surface-muted)] dark:bg-[#131823] border border-[var(--sp-border-strong)] rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 dark:focus:border-[#10F5A0] transition-colors"
                    />
                  </div>

                  {/* Mode Filter */}
                  <div className="xl:col-span-2">
                    <select
                      value={modeFilter}
                      onChange={(e) => setModeFilter(e.target.value as HistoryModeFilter)}
                      aria-label={t.researchModeLabel}
                      className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-[var(--sp-surface-muted)] dark:bg-[#131823] border border-[var(--sp-border-strong)] rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500 dark:focus:border-[#10F5A0] cursor-pointer transition-colors"
                    >
                      <option value="all">{t.historyFilterAllModes}</option>
                      <option value="fast">{t.modeFastTitle}</option>
                      <option value="balanced">{t.modeBalancedTitle}</option>
                      <option value="deep">{t.modeDeepTitle}</option>
                    </select>
                  </div>

                  {/* Category Filter */}
                  <div className="xl:col-span-3">
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                      aria-label={t.settingCategoryLabel}
                      className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-[var(--sp-surface-muted)] dark:bg-[#131823] border border-[var(--sp-border-strong)] rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500 dark:focus:border-[#10F5A0] cursor-pointer transition-colors"
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
                  <div className="xl:col-span-3">
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as HistorySortKey)}
                      aria-label={t.sortLabel}
                      className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-[var(--sp-surface-muted)] dark:bg-[#131823] border border-[var(--sp-border-strong)] rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500 dark:focus:border-[#10F5A0] cursor-pointer transition-colors"
                    >
                      <option value="newest">{t.historySortNewest}</option>
                      <option value="oldest">{t.historySortOldest}</option>
                      <option value="products-desc">{t.historySortMostProducts}</option>
                      <option value="cost-desc">{t.historySortCostDesc}</option>
                      <option value="cost-asc">{t.historySortCostAsc}</option>
                    </select>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {checkedIds.length > 0 && (
                    <motion.div
                      key="batch-bulk-delete"
                      initial={prefersReduced ? { opacity: 1 } : { height: 0, opacity: 0 }}
                      animate={{
                        height: 'auto',
                        opacity: 1,
                        transitionEnd: { overflow: 'visible' },
                      }}
                      exit={
                        prefersReduced
                          ? { opacity: 0 }
                          : { height: 0, opacity: 0, overflow: 'hidden' }
                      }
                      transition={MOTION_TRANSITIONS.accordion}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="pt-3 border-t border-[var(--sp-border)] flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-zinc-700 dark:text-zinc-300 tabular-nums">
                          <AnimatedNumber value={checkedIds.length} /> {t.historySelectedCount}
                        </span>
                        <div className="flex items-center gap-2">
                          <motion.button
                            type="button"
                            onClick={() => setCheckedIds([])}
                            whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                            transition={MOTION_TRANSITIONS.snappy}
                            className="sp-btn-ghost px-3"
                          >
                            {t.confirmCancelBtn}
                          </motion.button>
                          <motion.button
                            type="button"
                            onClick={handleDeleteSelected}
                            whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                            transition={MOTION_TRANSITIONS.snappy}
                            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 dark:bg-[#FE2C55] hover:bg-rose-700 dark:hover:brightness-110 rounded-xl transition-[filter,background-color] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>
                              {t.historyDeleteSelectedBtn} ({checkedIds.length})
                            </span>
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* History Records List */}
              {filteredRecords.length === 0 ? (
                <StateMessage
                  variant="empty"
                  icon={<Search className="w-5 h-5" aria-hidden="true" />}
                  reason={t.emptyFilteredTitle}
                  actionLabel={t.savedResetFiltersBtn}
                  actionIcon={<RotateCcw className="w-4 h-4" aria-hidden="true" />}
                  onAction={() => {
                    setSearchQuery('');
                    setModeFilter('all');
                    setCategoryFilter('all');
                  }}
                />
              ) : (
                <div className="space-y-3">
                  {filteredRecords.map((rec, idx) => {
                    const isChecked = checkedIds.includes(rec.id);
                    const isConfirmingDelete = confirmDeleteId === rec.id;
                    const isExpanded = expandedSessionIds.includes(rec.id);
                    const verdictCounts = recordVerdictCounts.get(rec.id) ?? {
                      recommended: 0,
                      'worth-testing': 0,
                      'need-more-data': 0,
                      'not-recommended': 0,
                      total: rec.products.length,
                    };
                    const verdictSegments = (
                      [
                        {
                          key: 'recommended',
                          count: verdictCounts.recommended,
                          label: t.decisionVerdictLabels.recommended,
                          barClass: 'bg-emerald-500 dark:bg-[#10F5A0]',
                          dotClass: 'bg-emerald-500 dark:bg-[#10F5A0]',
                        },
                        {
                          key: 'worth-testing',
                          count: verdictCounts['worth-testing'],
                          label: t.decisionVerdictLabels['worth-testing'],
                          barClass: 'bg-amber-400 dark:bg-amber-400',
                          dotClass: 'bg-amber-400 dark:bg-amber-400',
                        },
                        {
                          key: 'need-more-data',
                          count: verdictCounts['need-more-data'],
                          label: t.decisionVerdictLabels['need-more-data'],
                          barClass: 'bg-zinc-400 dark:bg-zinc-500',
                          dotClass: 'bg-zinc-400 dark:bg-zinc-500',
                        },
                        {
                          key: 'not-recommended',
                          count: verdictCounts['not-recommended'],
                          label: t.decisionVerdictLabels['not-recommended'],
                          barClass: 'bg-rose-500 dark:bg-[#FE2C55]',
                          dotClass: 'bg-rose-500 dark:bg-[#FE2C55]',
                        },
                      ] as const
                    ).filter((seg) => seg.count > 0);
                    const cardTitle = `${categoriesLabel(rec, language)} · ${rec.productCount} ${t.quantityProductsUnit}`;

                    return (
                      <motion.article
                        key={rec.id}
                        variants={prefersReduced ? undefined : MOTION_VARIANTS.cardReveal}
                        custom={idx}
                        initial={prefersReduced ? false : 'initial'}
                        animate="animate"
                        whileHover={prefersReduced ? undefined : TACTILE_INTERACTIONS.cardHover}
                        className="sp-card p-3.5 sm:p-5 hover:border-zinc-300 dark:hover:border-white/[0.16]"
                      >
                        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5 sm:gap-4">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleChecked(rec.id)}
                              aria-label={`${t.historySelectLabel} ${cardTitle}`}
                              className="mt-1 w-4 h-4 rounded-sm border-[var(--sp-border-strong)] accent-emerald-600 dark:accent-[#10F5A0] cursor-pointer shrink-0"
                            />

                            <div className="min-w-0 flex-1 space-y-2">
                              <div>
                                <button
                                  type="button"
                                  onClick={() => openArchiveRecord(rec)}
                                  title={`${t.historyRecordIdLabel}: ${rec.id}`}
                                  className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50 hover:text-emerald-700 dark:hover:text-[#10F5A0] transition-colors text-left cursor-pointer leading-snug rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:focus-visible:ring-[#10F5A0]"
                                >
                                  {cardTitle}
                                </button>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                                <span className="inline-flex items-center gap-1">
                                  <Calendar
                                    className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span>{formatResearchDateTime(rec.researchedAt, language)}</span>
                                </span>
                                <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                                  ·
                                </span>
                                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                  {modeLabel(rec.researchMode, language)}
                                </span>
                                <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                                  ·
                                </span>
                                <span className="font-mono tabular-nums">
                                  {t.actualCostLabel}:{' '}
                                  {rec.actualCredits !== null ? (
                                    <strong className="text-emerald-600 dark:text-[#10F5A0]">
                                      {formatCredits(rec.actualCredits)} cr
                                    </strong>
                                  ) : (
                                    <span className="text-zinc-500 dark:text-zinc-400">
                                      {t.actualCostUnavailable}
                                    </span>
                                  )}
                                </span>
                              </div>

                              {/* Stacked Verdict Breakdown Bar */}
                              {verdictCounts.total > 0 && verdictSegments.length > 0 && (
                                <div className="space-y-1.5 pt-0.5 max-w-xl">
                                  <div
                                    role="img"
                                    aria-label={`${t.historyVerdictBarLabel}: ${verdictSegments
                                      .map((s) => `${s.label} ${s.count}`)
                                      .join(', ')}`}
                                    className="h-2 w-full rounded-full overflow-hidden flex bg-zinc-200/80 dark:bg-white/[0.06] gap-px"
                                  >
                                    {verdictSegments.map((seg) => (
                                      <motion.div
                                        key={seg.key}
                                        title={`${seg.label}: ${seg.count}`}
                                        initial={prefersReduced ? false : { scaleX: 0 }}
                                        animate={{ scaleX: 1 }}
                                        transition={MOTION_TRANSITIONS.ticker}
                                        className={`h-full origin-left ${seg.barClass}`}
                                        style={{
                                          width: `${(seg.count / verdictCounts.total) * 100}%`,
                                        }}
                                      />
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                                    {verdictSegments.map((seg) => (
                                      <span
                                        key={seg.key}
                                        className="inline-flex items-center gap-1.5 whitespace-nowrap"
                                      >
                                        <span
                                          aria-hidden="true"
                                          className={`w-2 h-2 rounded-full shrink-0 ${seg.dotClass}`}
                                        />
                                        <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                                          {seg.count}
                                        </span>
                                        <span>{seg.label}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Row Actions */}
                          <div className="flex flex-wrap items-center gap-2 pl-7 xl:pl-0 xl:shrink-0">
                            <motion.button
                              type="button"
                              onClick={() => openArchiveRecord(rec)}
                              whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                              transition={MOTION_TRANSITIONS.snappy}
                              className="sp-btn-volt px-3.5 py-2 text-xs"
                            >
                              <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>{t.historyViewResultsBtn}</span>
                            </motion.button>

                            {rec.products.length > 0 && (
                              <motion.button
                                type="button"
                                onClick={() => toggleSessionExpanded(rec.id)}
                                aria-expanded={isExpanded}
                                whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                                transition={MOTION_TRANSITIONS.snappy}
                                className="sp-btn-secondary px-2.5 py-2 text-xs"
                                title={isMy ? 'ကုန်ပစ္စည်းအကျဉ်း ကြည့်ရန်' : 'Preview products'}
                              >
                                <motion.span
                                  animate={{ rotate: isExpanded ? 180 : 0 }}
                                  transition={MOTION_TRANSITIONS.snappy}
                                  className="inline-flex"
                                  aria-hidden="true"
                                >
                                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                                </motion.span>
                                <span className="font-mono tabular-nums">{rec.products.length}</span>
                              </motion.button>
                            )}

                            {records.length >= 2 && (
                              <motion.button
                                type="button"
                                onClick={() => handleOpenCompareWith(rec)}
                                whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                                transition={MOTION_TRANSITIONS.snappy}
                                className="sp-btn-secondary px-3 py-2"
                              >
                                <GitCompareArrows
                                  className="w-3.5 h-3.5 shrink-0 text-cyan-600 dark:text-[#25F4EE]"
                                  aria-hidden="true"
                                />
                                <span>{t.historyCompareBtn}</span>
                              </motion.button>
                            )}

                            {isConfirmingDelete ? (
                              <div className="inline-flex items-center gap-1.5">
                                <motion.button
                                  type="button"
                                  onClick={() => handleDeleteSingle(rec.id)}
                                  whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                                  transition={MOTION_TRANSITIONS.snappy}
                                  className="min-h-[40px] px-3 py-2 text-xs font-semibold text-white bg-rose-600 dark:bg-[#FE2C55] hover:bg-rose-700 dark:hover:brightness-110 rounded-xl transition-[filter,background-color] cursor-pointer whitespace-nowrap"
                                >
                                  {t.historyDeleteConfirmBtn}
                                </motion.button>
                                <motion.button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                                  transition={MOTION_TRANSITIONS.snappy}
                                  className="sp-btn-ghost px-2.5"
                                >
                                  {t.confirmCancelBtn}
                                </motion.button>
                              </div>
                            ) : (
                              <motion.button
                                type="button"
                                onClick={() => setConfirmDeleteId(rec.id)}
                                whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                                transition={MOTION_TRANSITIONS.snappy}
                                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-[var(--sp-surface)] border border-[var(--sp-border-strong)] hover:border-rose-400/70 dark:hover:border-[#FE2C55]/50 hover:text-rose-600 dark:hover:text-[#FE2C55] hover:bg-rose-50/50 dark:hover:bg-[#FE2C55]/[0.08] rounded-xl transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:focus-visible:ring-[#FE2C55]"
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>{t.historyDeleteBtn}</span>
                              </motion.button>
                            )}
                          </div>
                        </div>

                        {/* Expandable Session Product Preview Accordion (Myanmar-safe overflow) */}
                        <AnimatePresence initial={false}>
                          {isExpanded && rec.products.length > 0 && (
                            <motion.div
                              key={`session-preview-${rec.id}`}
                              initial={prefersReduced ? { opacity: 1 } : { height: 0, opacity: 0 }}
                              animate={{
                                height: 'auto',
                                opacity: 1,
                                transitionEnd: { overflow: 'visible' },
                              }}
                              exit={
                                prefersReduced
                                  ? { opacity: 0 }
                                  : { height: 0, opacity: 0, overflow: 'hidden' }
                              }
                              transition={MOTION_TRANSITIONS.accordion}
                              style={{ overflow: 'hidden' }}
                            >
                              <div className="mt-3.5 pt-3.5 border-t border-[var(--sp-border)] space-y-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {rec.products.slice(0, 6).map((prod) => {
                                    const snapScore = rec.scoreSnapshots?.[prod.id]?.totalScore;
                                    const verifiedComm =
                                      prod.commissionVerified &&
                                      typeof prod.commissionRate === 'number'
                                        ? prod.commissionRate
                                        : null;
                                    return (
                                      <motion.button
                                        key={prod.id}
                                        type="button"
                                        onClick={() =>
                                          onOpenReport(
                                            prod,
                                            rec.researchedAt,
                                            undefined,
                                            rec.products,
                                            rec.researchMode
                                          )
                                        }
                                        whileTap={
                                          prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap
                                        }
                                        transition={MOTION_TRANSITIONS.snappy}
                                        className="sp-surface-muted px-3 py-2 text-left flex items-center justify-between gap-2 hover:bg-zinc-200/70 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                                      >
                                        <span className="min-w-0 flex-1">
                                          <span className="block text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                            {isMy ? prod.nameMy : prod.name}
                                          </span>
                                          <span className="block font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                                            {typeof prod.priceThb === 'number'
                                              ? formatThb(prod.priceThb)
                                              : '—'}
                                            {verifiedComm !== null && (
                                              <span className="text-emerald-600 dark:text-[#10F5A0] ml-1.5 font-semibold">
                                                {verifiedComm.toFixed(1)}%
                                              </span>
                                            )}
                                          </span>
                                        </span>
                                        {typeof snapScore === 'number' && (
                                          <span className="font-mono text-xs font-semibold tabular-nums text-zinc-800 dark:text-zinc-200 shrink-0">
                                            {snapScore}
                                          </span>
                                        )}
                                      </motion.button>
                                    );
                                  })}
                                </div>
                                {rec.products.length > 6 && (
                                  <div className="flex justify-end">
                                    <motion.button
                                      type="button"
                                      onClick={() => openArchiveRecord(rec)}
                                      whileTap={
                                        prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap
                                      }
                                      transition={MOTION_TRANSITIONS.snappy}
                                      className="sp-btn-ghost text-xs text-emerald-600 dark:text-[#10F5A0]"
                                    >
                                      <span>
                                        {t.historyViewResultsBtn} ({rec.products.length})
                                      </span>
                                      <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                                    </motion.button>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Browser Storage Telemetry Bar (GPU scaleX progress + Mint / Amber >=70% / Coral >=85%) */}
      <footer
        className={`rounded-2xl border p-3.5 sm:p-4 space-y-2.5 transition-colors ${
          storageStats.usagePct >= 85
            ? 'bg-rose-50/70 dark:bg-[#FE2C55]/[0.08] border-rose-300/80 dark:border-[#FE2C55]/35'
            : storageStats.usagePct >= 70
              ? 'bg-amber-50/70 dark:bg-amber-500/[0.08] border-amber-300/80 dark:border-amber-400/35'
              : 'bg-[var(--sp-surface)] border-[var(--sp-border)]'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100">
            <HardDrive
              className={`w-4 h-4 shrink-0 ${storagePctTextTone}`}
              aria-hidden="true"
            />
            <span>{t.historyStorageUsageLabel}</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
            <span>
              Batch (<AnimatedNumber value={storageStats.historyCount} />):{' '}
              {formatByteSize(storageStats.historyBytes)}
            </span>
            <span>
              Single (<AnimatedNumber value={storageStats.singleHistoryCount ?? singleRecords.length} />):{' '}
              {formatByteSize(storageStats.singleHistoryBytes ?? 0)}
            </span>
            <span>
              Saved (<AnimatedNumber value={storageStats.savedCount} />):{' '}
              {formatByteSize(storageStats.savedBytes)}
            </span>
            <span className={`font-semibold ${storagePctTextTone}`}>
              {formatByteSize(storageStats.totalBytes)} /{' '}
              {formatByteSize(storageStats.estimatedQuotaBytes)} (
              <AnimatedNumber value={storageStats.usagePct} suffix="%" />)
            </span>
            {onOpenBackupRestore && (
              <motion.button
                type="button"
                onClick={() =>
                  onOpenBackupRestore(
                    records.length > 0 || singleRecords.length > 0 ? 'backup' : 'restore'
                  )
                }
                whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                transition={MOTION_TRANSITIONS.snappy}
                className="font-sans sp-btn-secondary px-3 py-1.5"
              >
                <HardDrive className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Backup / Restore</span>
              </motion.button>
            )}
          </div>
        </div>

        <div className="h-1.5 w-full bg-zinc-200/80 dark:bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            className={`h-full w-full rounded-full origin-left ${storageBarTone}`}
            initial={prefersReduced ? false : { scaleX: 0 }}
            animate={{ scaleX: storageFillScale }}
            transition={MOTION_TRANSITIONS.ticker}
          />
        </div>
      </footer>
    </section>
  );
}
