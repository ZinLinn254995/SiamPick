import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GitCompareArrows,
  Globe,
  History,
  Loader2,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  SearchCheck,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import {
  AiProductAnalysis,
  AppView,
  BothCategoryMode,
  CategoryFilter,
  ComparisonSelectionItem,
  DecisionFilter,
  GroundingSourceLink,
  KalodataShopEnrichmentRecord,
  Language,
  LinkImportExecuteResponse,
  OpportunityEvaluation,
  ProductCategory,
  ProductDecision,
  ProductDecisionSummary,
  ProductEnrichmentExecutionSummary,
  ProductResultsFilterState,
  ProductSortField,
  ResearchConfig,
  ResearchCostSummary,
  ResearchHistoryRecord,
  ResearchMode,
  ResearchProduct,
  ResearchQuantity,
  ResearchQuotaStatus,
  ResearchSessionResponse,
  SavedProductRecord,
  SortDirection,
  StorageWriteResult,
  StrategyPreset,
  SyncedKalodataCategoryCache,
} from './types/product';
import {
  DEFAULT_DEEP_DIVE_COUNT,
  DEFAULT_MYANMAR_VIDEO_SCAN_PAGES,
  DEFAULT_SPENDING_LIMIT_CREDITS,
  formatCredits,
  formatUsd,
  MAX_SPENDING_LIMIT_CREDITS,
  MIN_SPENDING_LIMIT_CREDITS,
} from './utils/kalodataPricing';
import {
  buildResolvedCategoryIdMap,
  DEFAULT_SELECTED_CATEGORIES,
  getCategoryLabel,
  getSelectableCategories,
  loadSyncedKalodataCategories,
  UNIVERSAL_CATEGORIES,
} from './utils/categoryRegistry';
import { evaluateProductBatch, getCanonicalProductId } from './utils/scoring';
import { isSafeHttpUrl, normalizeTikTokSourceUrl } from './utils/format';
import {
  computeBestProductSelections,
  DEFAULT_PRODUCT_FILTERS,
  deriveProductDecisionSummary,
  filterProducts,
  sortProductsByField,
} from './utils/productAnalytics';
import {
  buildProductsExportCsv,
  buildProductsExportJson,
  triggerFileDownload,
} from './utils/exportReports';
import {
  absorbProductsIntoEnrichmentCache,
  hydrateProductFromEnrichmentCache,
} from './utils/enrichmentCache';
import {
  getCanonicalShopId,
  mergeEnrichmentIntoProduct,
} from './utils/enrichmentPlanner';
import {
  createSavedRecord,
  formatResearchDate,
  loadSavedProducts,
  persistSavedProductsWithStatus,
} from './utils/savedProductsStorage';
import {
  createResearchHistoryRecord,
  loadLatestResearchSession,
  loadResearchHistory,
  persistLatestResearchSession,
  persistResearchHistory,
  type LatestResearchSessionMeta,
} from './utils/researchHistoryStorage';
import { TRANSLATIONS } from './i18n/translations';
import { Header } from './components/Header';
import { ResearchSettingsPanel } from './components/ResearchSettingsPanel';
import { ScoringRubricPanel } from './components/ScoringRubricPanel';
import { ResearchResultCard } from './components/ResearchResultCard';
import { ResearchReportDrawer } from './components/ResearchReportDrawer';
import { SavedProductsView } from './components/SavedProductsView';
import { ResearchHistoryView } from './components/ResearchHistoryView';
import { KalodataBalanceBar } from './components/KalodataBalanceBar';
import { BestProductsStrip } from './components/BestProductsStrip';
import { ProductFilterBar } from './components/ProductFilterBar';
import { ProductComparisonModal } from './components/ProductComparisonModal';
import { BackupRestoreModal, type BackupModalTab } from './components/BackupRestoreModal';
import type { BackupRestoreResult } from './utils/backupStorage';
import { InfoPopover } from './components/InfoPopover';
import { ProductLinkImportPanel } from './components/ProductLinkImportPanel';
import { DeepDiveWorkspaceView } from './components/DeepDiveWorkspaceView';
import { useTheme } from './hooks/useTheme';
import { useKalodataBalance } from './hooks/useKalodataBalance';
import type {
  DeepDiveAnalysisId,
  DeepDiveHistoryRecord,
  DeepDiveOriginView,
  DeepDiveServerBudgetSnapshot,
  DeepDiveSourceContext,
  DeepDiveWorkspaceState,
} from './types/deepDive';
import {
  buildDeepDiveTargetContext,
  clearAllDeepDiveOptions,
  createInitialDeepDiveWorkspaceState,
  selectAllDeepDiveOptions,
  toggleDeepDiveExpansion,
  toggleDeepDiveSelection,
} from './utils/deepDiveRegistry';
import { runDeepDiveModules } from './utils/deepDiveEngine';
import {
  appendDeepDiveHistoryRecord,
  createDeepDiveHistoryRecord,
  deleteDeepDiveHistoryRecord,
  hydrateWorkspaceStateFromHistory,
  loadAllDeepDiveHistoryByProduct,
} from './utils/deepDiveHistoryStorage';

const STRATEGY_WEIGHTS: Record<StrategyPreset, number> = {
  balanced: 50,
  'sales-first': 70,
  'commission-first': 30,
};

interface ActiveReportState {
  product: ResearchProduct;
  researchDate: string | null;
  evaluation?: OpportunityEvaluation | null;
  peerProducts?: readonly ResearchProduct[];
  sourceView: AppView;
  researchMode?: ResearchMode;
}

type SessionMeta = LatestResearchSessionMeta;

interface HuntErrorState {
  messageEn: string;
  messageMy?: string;
  code?: string;
}

const SPENDING_LIMIT_STORAGE_KEY = 'siampick_spending_limit_credits_v1';
const LANGUAGE_STORAGE_KEY = 'siampick_language_v1';
const RESEARCH_CLIENT_TIMEOUT_MS = 180_000;

function loadSavedLanguage(): Language {
  try {
    const raw = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (raw === 'my' || raw === 'en') return raw;
  } catch {
    // Ignore storage unavailability
  }
  return 'en';
}

function loadSavedSpendingLimit(): number {
  try {
    const raw = window.localStorage.getItem(SPENDING_LIMIT_STORAGE_KEY);
    if (!raw) return DEFAULT_SPENDING_LIMIT_CREDITS;
    const parsed = Number.parseFloat(raw);
    if (
      Number.isFinite(parsed) &&
      parsed >= MIN_SPENDING_LIMIT_CREDITS &&
      parsed <= MAX_SPENDING_LIMIT_CREDITS
    ) {
      return Math.round(parsed * 1000) / 1000;
    }
  } catch {
    // Ignore storage unavailability
  }
  return DEFAULT_SPENDING_LIMIT_CREDITS;
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [language, setLanguage] = useState<Language>(() => loadSavedLanguage());
  const [activeView, setActiveView] = useState<AppView>('hunting');

  // Research Settings State (Universal Categories + Optional L2 Subcategories + Synced Cache)
  const [syncedCategoryCache, setSyncedCategoryCache] = useState<SyncedKalodataCategoryCache>(() =>
    loadSyncedKalodataCategories()
  );
  const [selectedCategories, setSelectedCategories] = useState<ProductCategory[]>([
    ...DEFAULT_SELECTED_CATEGORIES,
  ]);
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = useState<string[]>([]);
  const [bothCategoryMode, setBothCategoryMode] = useState<BothCategoryMode>('combined');
  const [researchMode, setResearchMode] = useState<ResearchMode>('fast');
  const [deepDiveCount, setDeepDiveCount] = useState<number>(DEFAULT_DEEP_DIVE_COUNT);
  const [includeReviewInsights, setIncludeReviewInsights] = useState<boolean>(false);
  const [strategyPreset, setStrategyPreset] = useState<StrategyPreset>('balanced');
  const [salesWeightPct, setSalesWeightPct] = useState<number>(50);
  const [showFineTune, setShowFineTune] = useState(false);
  const [quantity, setQuantity] = useState<ResearchQuantity>(10);
  const [spendingLimitCredits, setSpendingLimitCredits] = useState<number>(() =>
    loadSavedSpendingLimit()
  );
  const [myanmarLanguageOnly, setMyanmarLanguageOnly] = useState<boolean>(false);
  const [myanmarVideoScanPages, setMyanmarVideoScanPages] = useState<number>(
    DEFAULT_MYANMAR_VIDEO_SCAN_PAGES
  );

  // Hydrate initial History + Latest Research Results synchronously on first render
  // so closing and reopening the app always preserves the most recent Research Results.
  const initialBootstrapRef = useRef<{
    history: ResearchHistoryRecord[];
    latestSession: ReturnType<typeof loadLatestResearchSession>;
  } | null>(null);
  if (initialBootstrapRef.current === null) {
    const initialHistory = loadResearchHistory();
    initialBootstrapRef.current = {
      history: initialHistory,
      latestSession: loadLatestResearchSession(initialHistory),
    };
  }
  const initialSession = initialBootstrapRef.current.latestSession;

  // Live Research State (Restored automatically from latest persisted session)
  const [liveResults, setLiveResults] = useState<ResearchProduct[]>(
    () => initialSession?.products ?? []
  );
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(
    () => initialSession?.sessionMeta ?? null
  );
  const [lastCostSummary, setLastCostSummary] = useState<ResearchCostSummary | null>(
    () => initialSession?.lastCostSummary ?? null
  );
  const [balanceRefreshSignal, setBalanceRefreshSignal] = useState<number>(0);
  const creditBalance = useKalodataBalance(balanceRefreshSignal);
  const [researchSourceMode, setResearchSourceMode] = useState<'kalodata-openapi' | null>(
    () => initialSession?.researchSourceMode ?? null
  );
  const [researchedAt, setResearchedAt] = useState<string | null>(
    () => initialSession?.researchedAt ?? null
  );
  const [groundingSources, setGroundingSources] = useState<GroundingSourceLink[]>(
    () => initialSession?.groundingSources ?? []
  );
  const [searchQueries, setSearchQueries] = useState<string[]>(
    () => initialSession?.searchQueries ?? []
  );
  const [groundingOpen, setGroundingOpen] = useState(false);
  const [isHunting, setIsHunting] = useState(false);
  const [huntError, setHuntError] = useState<HuntErrorState | null>(null);
  const [activeHuntConfig, setActiveHuntConfig] = useState<ResearchConfig | null>(
    () => initialSession?.activeHuntConfig ?? null
  );

  // Quota Pause / Resume State (Hydrated from server on mount)
  const [quotaStatus, setQuotaStatus] = useState<ResearchQuotaStatus>({
    paused: false,
    reason: null,
    pausedAt: null,
  });

  // Persisted Saved Products (strictly separate localStorage key from Research History)
  const [savedRecords, setSavedRecords] = useState<SavedProductRecord[]>(() =>
    loadSavedProducts()
  );

  // Automatic Local Research History (strictly separate localStorage key from Saved Products)
  const [researchHistory, setResearchHistory] = useState<ResearchHistoryRecord[]>(
    () => initialBootstrapRef.current?.history ?? []
  );
  const [storageAlert, setStorageAlert] = useState<StorageWriteResult | null>(null);

  // Session Rejected IDs (preserved across refresh for the active latest result set)
  const [rejectedIds, setRejectedIds] = useState<string[]>(
    () => initialSession?.rejectedIds ?? []
  );

  // Phase 5: Results Multi-Filter, 8-Field Sort & Multi-Product Comparison State
  const [filters, setFilters] = useState<ProductResultsFilterState>({
    ...DEFAULT_PRODUCT_FILTERS,
  });
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('active');
  const [sortField, setSortField] = useState<ProductSortField>('overallScore');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [compareItems, setCompareItems] = useState<ComparisonSelectionItem[]>([]);
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [backupModalTab, setBackupModalTab] = useState<BackupModalTab>('backup');

  // Report Drawer & Scoring Guide
  const [activeReport, setActiveReport] = useState<ActiveReportState | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);

  // Phase 9.1 / 9.4: Deep Dive Foundation & Per-Product Browser History (Zero mutation of original results)
  const [deepDiveTarget, setDeepDiveTarget] = useState<DeepDiveSourceContext | null>(null);
  const [deepDiveStatesByProduct, setDeepDiveStatesByProduct] = useState<
    Record<string, DeepDiveWorkspaceState>
  >({});
  const [deepDiveHistoryByProduct, setDeepDiveHistoryByProduct] = useState<
    Record<string, DeepDiveHistoryRecord[]>
  >(() => loadAllDeepDiveHistoryByProduct());

  // Phase 9.3.1: Authoritative Server-Side Persistent Budget Ledger Status
  const [serverBudgetStatus, setServerBudgetStatus] = useState<{
    loaded: boolean;
    storageAvailable: boolean;
    snapshot: DeepDiveServerBudgetSnapshot | null;
    errorEn: string | null;
    errorMy: string | null;
  }>({
    loaded: false,
    storageAvailable: true,
    snapshot: null,
    errorEn: null,
    errorMy: null,
  });

  const settingsSectionRef = useRef<HTMLDivElement>(null);
  const resultsSectionRef = useRef<HTMLElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const huntingInFlightRef = useRef(false);
  const deepDiveInFlightKeysRef = useRef<Set<string>>(new Set());
  const hasMountedSavedRef = useRef(false);
  const hasMountedLatestSessionRef = useRef(false);

  // Persist Saved Products to localStorage whenever updated (surfaces QuotaExceeded cleanly)
  useEffect(() => {
    if (!hasMountedSavedRef.current) {
      hasMountedSavedRef.current = true;
      return;
    }
    const writeRes = persistSavedProductsWithStatus(savedRecords);
    if (!writeRes.ok) {
      setStorageAlert(writeRes);
    }
  }, [savedRecords]);

  // Persist the latest Research Results session to localStorage so closing & reopening the app
  // always restores the most recent search results (and any subsequent AI analyses / enrichments / rejects).
  useEffect(() => {
    if (!hasMountedLatestSessionRef.current) {
      hasMountedLatestSessionRef.current = true;
      return;
    }
    if (!sessionMeta && liveResults.length === 0) {
      return;
    }
    persistLatestResearchSession({
      products: liveResults,
      sessionMeta: sessionMeta ?? {
        requestedQuantity: liveResults.length,
        verifiedProductCount: liveResults.length,
        filteredOutCount: 0,
      },
      lastCostSummary,
      researchSourceMode,
      researchedAt,
      groundingSources,
      searchQueries,
      activeHuntConfig,
      rejectedIds,
    });
  }, [
    liveResults,
    sessionMeta,
    lastCostSummary,
    researchSourceMode,
    researchedAt,
    groundingSources,
    searchQueries,
    activeHuntConfig,
    rejectedIds,
  ]);

  // Persist user language preference across refreshes
  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore storage unavailability
    }
  }, [language]);

  // Persist user Spending Limit across refreshes
  useEffect(() => {
    try {
      window.localStorage.setItem(SPENDING_LIMIT_STORAGE_KEY, String(spendingLimitCredits));
    } catch {
      // Ignore storage unavailability
    }
  }, [spendingLimitCredits]);

  // Hydrate server-side Research Quota Pause state on load
  useEffect(() => {
    let active = true;
    fetch('/api/research/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ResearchQuotaStatus | null) => {
        if (active && data && typeof data.paused === 'boolean') {
          setQuotaStatus(data);
        }
      })
      .catch(() => {
        // Ignore transient network errors on initial status check
      });
    return () => {
      active = false;
    };
  }, []);

  // Phase 9.3.1: Hydrate authoritative server-side persistent budget ledger status on load
  const refreshServerBudgetStatus = async () => {
    try {
      const res = await fetch('/api/budget/status');
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        storageAvailable?: boolean;
        budget?: DeepDiveServerBudgetSnapshot | null;
        error?: string;
        errorMy?: string;
      } | null;

      if (!res.ok || !data?.ok || data.storageAvailable === false) {
        setServerBudgetStatus({
          loaded: true,
          storageAvailable: false,
          snapshot: null,
          errorEn:
            data?.error ??
            'Persistent budget storage is unavailable. Paid Kalodata API calls are temporarily blocked for safety.',
          errorMy:
            data?.errorMy ??
            'Persistent Budget Storage မရရှိနိုင်သေးသဖြင့် ကုန်ကျစရိတ်လုံခြုံရေးအတွက် Paid Kalodata API ခေါ်ဆိုမှုများကို ယာယီပိတ်ထားပါသည်။',
        });
        return;
      }

      if (data.budget) {
        setServerBudgetStatus({
          loaded: true,
          storageAvailable: true,
          snapshot: data.budget,
          errorEn: null,
          errorMy: null,
        });
        if (
          typeof data.budget.configuredLimitCredits === 'number' &&
          Number.isFinite(data.budget.configuredLimitCredits)
        ) {
          setSpendingLimitCredits(data.budget.configuredLimitCredits);
        }
      }
    } catch {
      // Transient network error on initial check; server still enforces fail-closed on paid requests
    }
  };

  useEffect(() => {
    void refreshServerBudgetStatus();
  }, []);

  const handleSpendingLimitChange = (nextLimit: number) => {
    if (!Number.isFinite(nextLimit)) return;
    const clamped =
      Math.round(
        Math.max(MIN_SPENDING_LIMIT_CREDITS, Math.min(MAX_SPENDING_LIMIT_CREDITS, nextLimit)) * 1000
      ) / 1000;
    setSpendingLimitCredits(clamped);

    void fetch('/api/budget/limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spendingLimitCredits: clamped }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          storageAvailable?: boolean;
          budget?: DeepDiveServerBudgetSnapshot | null;
          error?: string;
          errorMy?: string;
        } | null;

        if (!res.ok || !data?.ok) {
          if (res.status === 503 || data?.storageAvailable === false) {
            setServerBudgetStatus({
              loaded: true,
              storageAvailable: false,
              snapshot: null,
              errorEn:
                data?.error ??
                'Persistent budget storage is unavailable. Paid Kalodata API calls are temporarily blocked for safety.',
              errorMy:
                data?.errorMy ??
                'Persistent Budget Storage မရရှိနိုင်သေးသဖြင့် ကုန်ကျစရိတ်လုံခြုံရေးအတွက် Paid Kalodata API ခေါ်ဆိုမှုများကို ယာယီပိတ်ထားပါသည်။',
            });
          }
          return;
        }

        if (data.budget) {
          setServerBudgetStatus({
            loaded: true,
            storageAvailable: true,
            snapshot: data.budget,
            errorEn: null,
            errorMy: null,
          });
        }
      })
      .catch(() => {
        // Ignore transient network errors; server enforces authoritative limit on next paid request
      });
  };

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const t = TRANSLATIONS[language];

  const savedIdSet = useMemo(() => new Set(savedRecords.map((r) => r.id)), [savedRecords]);
  const rejectedIdSet = useMemo(() => new Set(rejectedIds), [rejectedIds]);

  const getDecision = (id: string): ProductDecision => {
    if (savedIdSet.has(id)) return 'saved';
    if (rejectedIdSet.has(id)) return 'rejected';
    return 'pending';
  };

  const findProductById = (id: string): ResearchProduct | null => {
    const inLive = liveResults.find((p) => p.id === id);
    if (inLive) return inLive;
    const inSaved = savedRecords.find((r) => r.id === id);
    if (inSaved) return inSaved.product;
    if (activeReport && activeReport.product.id === id) return activeReport.product;
    for (const rec of researchHistory) {
      const inHistory = rec.products.find((p) => p.id === id);
      if (inHistory) return inHistory;
    }
    return null;
  };

  const handleToggleSave = (id: string) => {
    if (savedIdSet.has(id)) {
      setSavedRecords((prev) => prev.filter((r) => r.id !== id));
      return;
    }

    const product = findProductById(id);
    if (!product) return;

    const record = createSavedRecord(product);
    setSavedRecords((prev) => [record, ...prev.filter((r) => r.id !== id)]);
    setRejectedIds((prev) => prev.filter((item) => item !== id));

    setActiveReport((prev) =>
      prev && prev.product.id === id
        ? { ...prev, researchDate: record.researchDate }
        : prev
    );
  };

  const handleSaveProductFromArchive = (product: ResearchProduct, archiveDate: string) => {
    if (savedIdSet.has(product.id)) {
      setSavedRecords((prev) => prev.filter((r) => r.id !== product.id));
      return;
    }
    const record = createSavedRecord({
      ...product,
      researchedAt: product.researchedAt ?? archiveDate,
    });
    setSavedRecords((prev) => [record, ...prev.filter((r) => r.id !== product.id)]);
  };

  const handleDeleteSaved = (id: string) => {
    setSavedRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleDeleteHistoryRecords = (idsToDelete: string[]) => {
    if (idsToDelete.length === 0) return;
    const deleteSet = new Set(idsToDelete);
    setResearchHistory((prev) => {
      const next = prev.filter((rec) => !deleteSet.has(rec.id));
      const writeRes = persistResearchHistory(next);
      if (writeRes.ok) {
        setStorageAlert(null);
      } else {
        setStorageAlert(writeRes);
      }
      return next;
    });
  };

  const handleToggleReject = (id: string) => {
    if (rejectedIdSet.has(id)) {
      setRejectedIds((prev) => prev.filter((item) => item !== id));
      return;
    }
    setRejectedIds((prev) => [...prev, id]);
    setSavedRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSelectStrategyPreset = (preset: StrategyPreset) => {
    setStrategyPreset(preset);
    setSalesWeightPct(STRATEGY_WEIGHTS[preset]);
  };

  const handleCustomWeightChange = (newSalesWeight: number) => {
    setSalesWeightPct(newSalesWeight);
    if (newSalesWeight >= 62) {
      setStrategyPreset('sales-first');
    } else if (newSalesWeight <= 38) {
      setStrategyPreset('commission-first');
    } else {
      setStrategyPreset('balanced');
    }
  };

  const handleGoHome = () => {
    setActiveView('hunting');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFocusSettings = () => {
    setActiveView('hunting');
    window.setTimeout(() => {
      settingsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleHeaderCategorySelect = (cat: CategoryFilter) => {
    setActiveView('hunting');
    setFilters((prev) => ({ ...prev, category: cat }));
    window.setTimeout(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleCancelHunting = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsHunting(false);
  };

  const handlePauseResearch = async () => {
    try {
      const res = await fetch('/api/research/pause', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as ResearchQuotaStatus;
        setQuotaStatus(data);
      }
    } catch {
      setQuotaStatus({ paused: true, reason: 'manual', pausedAt: new Date().toISOString() });
    }
  };

  const handleResumeResearch = async () => {
    try {
      const res = await fetch('/api/research/resume', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as ResearchQuotaStatus;
        setQuotaStatus(data);
      }
    } catch {
      setQuotaStatus({ paused: false, reason: null, pausedAt: null });
    }
    setHuntError(null);
  };

  const handleToggleSettingsCategory = (cat: ProductCategory) => {
    setSelectedCategories((prev) => {
      const next = prev.includes(cat) ? prev.filter((item) => item !== cat) : [...prev, cat];
      return next;
    });
    // Clear L2 subcategory selections that no longer belong to any selected parent category
    setSelectedSubcategoryIds((prevSubs) => {
      if (prevSubs.length === 0) return prevSubs;
      const nextCats = selectedCategories.includes(cat)
        ? selectedCategories.filter((c) => c !== cat)
        : [...selectedCategories, cat];
      const nextSet = new Set(nextCats);
      return prevSubs.filter((subId) => {
        const sub = syncedCategoryCache.subcategories.find((s) => s.id === subId);
        return !sub?.parentCategory || nextSet.has(sub.parentCategory);
      });
    });
  };

  const handleSelectAllVerifiedCategories = () => {
    const selectable = getSelectableCategories(syncedCategoryCache);
    setSelectedCategories(selectable.length > 0 ? selectable : [...DEFAULT_SELECTED_CATEGORIES]);
  };

  const handleClearAllCategories = () => {
    setSelectedCategories([]);
    setSelectedSubcategoryIds([]);
  };

  const handleSyncedCategoryCacheChange = (nextCache: SyncedKalodataCategoryCache) => {
    setSyncedCategoryCache(nextCache);
    const selectableSet = new Set(getSelectableCategories(nextCache));
    setSelectedCategories((prev) => {
      const pruned = prev.filter((cat) => selectableSet.has(cat));
      const nextSelected = pruned.length > 0 ? pruned : [...DEFAULT_SELECTED_CATEGORIES];
      const nextSelectedSet = new Set(nextSelected);
      setSelectedSubcategoryIds((prevSubs) =>
        prevSubs.filter((subId) => {
          const sub = nextCache.subcategories.find((s) => s.id === subId);
          return !sub?.parentCategory || nextSelectedSet.has(sub.parentCategory);
        })
      );
      return nextSelected;
    });
  };

  const handleToggleSubcategory = (subId: string) => {
    setSelectedSubcategoryIds((prev) =>
      prev.includes(subId) ? prev.filter((id) => id !== subId) : [...prev, subId]
    );
  };

  const handleClearSubcategories = () => {
    setSelectedSubcategoryIds([]);
  };

  const handleStartHunting = async (forceResumeOverride?: boolean) => {
    if (selectedCategories.length === 0 || huntingInFlightRef.current) {
      return;
    }

    huntingInFlightRef.current = true;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, RESEARCH_CLIENT_TIMEOUT_MS);

    const shouldForceResume = forceResumeOverride === true || quotaStatus.paused;
    const derivedCategory: CategoryFilter =
      selectedCategories.length === 1 ? selectedCategories[0] : 'all';
    const resolvedCategoryIdMap = buildResolvedCategoryIdMap(syncedCategoryCache);
    const selectedSubcategoryNames = selectedSubcategoryIds
      .map((id) => syncedCategoryCache.subcategories.find((s) => s.id === id)?.name ?? id)
      .filter(Boolean);

    const payload: ResearchConfig & { forceResume?: boolean } = {
      market: 'Thailand TikTok Shop',
      category: derivedCategory,
      selectedCategories,
      selectedSubcategoryIds:
        selectedSubcategoryIds.length > 0 ? selectedSubcategoryIds : undefined,
      selectedSubcategoryNames:
        selectedSubcategoryNames.length > 0 ? selectedSubcategoryNames : undefined,
      resolvedCategoryIdMap,
      bothCategoryMode:
        selectedCategories.length >= 2 && selectedSubcategoryIds.length === 0
          ? bothCategoryMode
          : 'combined',
      researchMode,
      deepDiveCount: researchMode === 'deep' ? deepDiveCount : undefined,
      includeReviewInsights: researchMode === 'deep' ? includeReviewInsights : false,
      spendingLimitCredits,
      priceLimit: 'unrestricted',
      strategyPreset,
      salesWeightPct,
      quantity,
      ...(myanmarLanguageOnly
        ? {
            myanmarLanguageOnly: true,
            myanmarDiscoveryMode: 'video-first' as const,
            myanmarVideoScanPages,
          }
        : {}),
      forceResume: shouldForceResume,
    };

    setActiveView('hunting');
    setHuntError(null);
    setIsHunting(true);

    window.setTimeout(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data = (await response.json().catch(() => null)) as
        | ResearchSessionResponse
        | {
            error?: string;
            errorMy?: string;
            code?: string;
            quotaPaused?: boolean;
            quotaStatus?: ResearchQuotaStatus;
          }
        | null;

      if (!response.ok) {
        if (data && 'quotaStatus' in data && data.quotaStatus) {
          setQuotaStatus(data.quotaStatus);
        } else if (data && 'quotaPaused' in data && data.quotaPaused) {
          setQuotaStatus({
            paused: true,
            reason: 'manual',
            pausedAt: new Date().toISOString(),
          });
        }

        // When research is paused manually, the dedicated Paused banner handles messaging cleanly
        const isQuotaPauseError =
          data && 'code' in data && data.code === 'RESEARCH_PAUSED';

        if (!isQuotaPauseError) {
          const messageEn =
            data && 'error' in data && typeof data.error === 'string'
              ? data.error
              : `Request failed (HTTP ${response.status})`;
          const messageMy =
            data && 'errorMy' in data && typeof data.errorMy === 'string'
              ? data.errorMy
              : undefined;
          setHuntError({
            messageEn,
            messageMy,
            code: data && 'code' in data ? data.code : undefined,
          });
        }
        return;
      }

      if (!data || !('products' in data) || !Array.isArray(data.products)) {
        setHuntError({
          messageEn: 'Invalid research response received from server.',
        });
        return;
      }

      // Live verified research succeeded — clear any paused state
      setQuotaStatus({ paused: false, reason: null, pausedAt: null });

      // Phase 4: Absorb newly enriched Product/Shop/Review data into localStorage cache,
      // and hydrate any un-enriched Fast/Balanced items with already-cached Shop/Detail data at 0 credits
      absorbProductsIntoEnrichmentCache(data.products);
      const hydratedProducts = data.products.map(
        (item) =>
          hydrateProductFromEnrichmentCache(item, {
            salesWeightPct: payload.salesWeightPct,
            peerProducts: data.products,
          }).product
      );

      const nextSessionMeta: SessionMeta = {
        requestedQuantity: data.requestedQuantity ?? payload.quantity,
        verifiedProductCount: data.verifiedProductCount ?? hydratedProducts.length,
        filteredOutCount: data.filteredOutCount ?? 0,
        myanmarFilterApplied: data.myanmarFilterApplied === true,
        myanmarCandidatesScanned: data.myanmarCandidatesScanned,
        myanmarReviewDiscovery: data.myanmarReviewDiscovery,
        myanmarVideoDiscovery: data.myanmarVideoDiscovery,
      };
      const nextCostSummary = data.costSummary ?? null;
      const nextSourceMode = data.researchSourceMode ?? 'kalodata-openapi';
      const nextResearchedAt = data.researchedAt ?? new Date().toISOString();
      const nextGroundingSources = Array.isArray(data.groundingSources)
        ? data.groundingSources
        : [];
      const nextSearchQueries = Array.isArray(data.searchQueries) ? data.searchQueries : [];

      setActiveHuntConfig(payload);
      setDecisionFilter('active');
      setFilters({ ...DEFAULT_PRODUCT_FILTERS, category: payload.category });
      setLiveResults(hydratedProducts);
      setSessionMeta(nextSessionMeta);
      setLastCostSummary(nextCostSummary);
      setBalanceRefreshSignal((prev) => prev + 1);
      setResearchSourceMode(nextSourceMode);
      setResearchedAt(nextResearchedAt);
      setGroundingSources(nextGroundingSources);
      setSearchQueries(nextSearchQueries);
      setRejectedIds([]);
      setGroundingOpen(false);

      // Immediately replace the persisted latest Research Results snapshot in localStorage
      persistLatestResearchSession({
        products: hydratedProducts,
        sessionMeta: nextSessionMeta,
        lastCostSummary: nextCostSummary,
        researchSourceMode: nextSourceMode,
        researchedAt: nextResearchedAt,
        groundingSources: nextGroundingSources,
        searchQueries: nextSearchQueries,
        activeHuntConfig: payload,
        rejectedIds: [],
      });

      // Phase 2: Automatically archive every completed Product Hunting run into Local Research History
      // Strictly separate from Saved Products; never silently deletes older History runs on QuotaExceededError
      const newHistoryRecord = createResearchHistoryRecord(
        { ...data, products: hydratedProducts },
        payload
      );
      setResearchHistory((prev) => {
        const nextHistory = [newHistoryRecord, ...prev];
        const writeRes = persistResearchHistory(nextHistory);
        if (!writeRes.ok) {
          setStorageAlert(writeRes);
          return prev;
        }
        setStorageAlert(null);
        return nextHistory;
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (timedOut) {
          setHuntError({
            messageEn: 'Product research request timed out. Please check your connection and try again.',
            messageMy: 'Product ရှာဖွေမှု အချိန်ကျော်လွန်သွားပါသည်။ အင်တာနက်ချိတ်ဆက်မှုကို စစ်ဆေးပြီး ထပ်မံစမ်းသပ်ပါ။',
            code: 'CLIENT_TIMEOUT',
          });
        }
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Unable to complete product research.';
      setHuntError({ messageEn: message });
    } finally {
      window.clearTimeout(timeoutId);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsHunting(false);
      }
      huntingInFlightRef.current = false;
    }
  };

  const findWorkspaceProductByCanonicalId = (canonicalId: string): ResearchProduct | null => {
    const cleanTarget = canonicalId.trim();
    const inLive = liveResults.find((p) => getCanonicalProductId(p) === cleanTarget);
    if (inLive) return inLive;
    const inSaved = savedRecords.find((r) => getCanonicalProductId(r.product) === cleanTarget);
    if (inSaved) return inSaved.product;
    for (const rec of researchHistory) {
      const inHistory = rec.products.find((p) => getCanonicalProductId(p) === cleanTarget);
      if (inHistory) return inHistory;
    }
    return null;
  };

  const upsertProductIntoLiveResults = (incoming: ResearchProduct) => {
    const canonicalTarget = getCanonicalProductId(incoming);
    absorbProductsIntoEnrichmentCache([incoming]);
    const hydrated = hydrateProductFromEnrichmentCache(incoming, {
      salesWeightPct,
      peerProducts: liveResults,
    }).product;

    setLiveResults((prev) => {
      const filtered = prev.filter((item) => getCanonicalProductId(item) !== canonicalTarget);
      return [hydrated, ...filtered];
    });
    setRejectedIds((prev) =>
      prev.filter(
        (rid) =>
          rid !== hydrated.id &&
          getCanonicalProductId({ ...hydrated, id: rid }) !== canonicalTarget
      )
    );
    setDecisionFilter((prev) => (prev === 'rejected' ? 'active' : prev));
    setFilters((prev) => ({
      ...prev,
      category:
        prev.category !== 'all' && prev.category !== hydrated.category ? 'all' : prev.category,
      searchQuery: '',
    }));
    setResearchSourceMode((prev) => prev ?? 'kalodata-openapi');
    setResearchedAt((prev) => prev ?? hydrated.researchedAt ?? new Date().toISOString());
    setSessionMeta((prev) =>
      prev ?? {
        requestedQuantity: 1,
        verifiedProductCount: 1,
        filteredOutCount: 0,
      }
    );
    return hydrated;
  };

  const handleRestoreExistingProductToResults = (product: ResearchProduct) => {
    upsertProductIntoLiveResults(product);
    window.setTimeout(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleProductImportedFromLink = (result: LinkImportExecuteResponse) => {
    upsertProductIntoLiveResults(result.product);
    if (result.apiCallsMade > 0) {
      setBalanceRefreshSignal((prev) => prev + 1);
      void refreshServerBudgetStatus();
      setLastCostSummary(result.costSummary);
    }
  };

  const handleOpenResultReport = (product: ResearchProduct) => {
    const existingSaved = savedRecords.find((r) => r.id === product.id);
    setActiveReport({
      product,
      researchDate: existingSaved?.researchDate ?? product.researchedAt ?? researchedAt,
      evaluation: null,
      peerProducts: liveResults,
      sourceView: 'hunting',
    });
  };

  const handleOpenSavedReport = (record: SavedProductRecord) => {
    setActiveReport({
      product: record.product,
      researchDate: record.researchDate,
      evaluation: null,
      peerProducts: savedRecords.map((r) => r.product),
      sourceView: 'saved',
    });
  };

  const handleOpenHistoryReport = (
    product: ResearchProduct,
    archiveDate: string,
    evaluation?: OpportunityEvaluation,
    peerProducts?: readonly ResearchProduct[],
    historyResearchMode?: ResearchMode
  ) => {
    setActiveReport({
      product,
      researchDate: archiveDate,
      evaluation: evaluation ?? null,
      peerProducts,
      sourceView: 'history',
      researchMode: historyResearchMode,
    });
  };

  const handleOpenDeepDive = (
    product: ResearchProduct,
    originView: DeepDiveOriginView,
    researchDateOverride?: string | null,
    researchModeOverride?: ResearchMode
  ) => {
    const context = buildDeepDiveTargetContext(
      product,
      originView,
      researchModeOverride ?? activeHuntConfig?.researchMode ?? researchMode,
      researchDateOverride ?? product.researchedAt ?? researchedAt
    );
    setActiveReport(null);
    setDeepDiveTarget(context);
    const productHistory = deepDiveHistoryByProduct[context.canonicalProductId] ?? [];
    setDeepDiveStatesByProduct((prev) =>
      prev[context.canonicalProductId]
        ? prev
        : {
            ...prev,
            [context.canonicalProductId]: hydrateWorkspaceStateFromHistory(
              createInitialDeepDiveWorkspaceState(),
              productHistory
            ),
          }
    );
    setActiveView('deep-dive');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateActiveDeepDiveState = (
    updater: (current: DeepDiveWorkspaceState) => DeepDiveWorkspaceState
  ) => {
    if (!deepDiveTarget) return;
    const key = deepDiveTarget.canonicalProductId;
    setDeepDiveStatesByProduct((prev) => {
      const current = prev[key] ?? createInitialDeepDiveWorkspaceState();
      return {
        ...prev,
        [key]: updater(current),
      };
    });
  };

  const handleDeepDiveToggleOption = (id: DeepDiveAnalysisId) => {
    updateActiveDeepDiveState((current) => toggleDeepDiveSelection(current, id));
  };

  const handleDeepDiveSelectAll = () => {
    updateActiveDeepDiveState((current) => selectAllDeepDiveOptions(current));
  };

  const handleDeepDiveClearAll = () => {
    updateActiveDeepDiveState((current) => clearAllDeepDiveOptions(current));
  };

  const handleDeepDiveToggleExpand = (id: DeepDiveAnalysisId) => {
    updateActiveDeepDiveState((current) => toggleDeepDiveExpansion(current, id));
  };

  const resolveDeepDivePeerProducts = (target: DeepDiveSourceContext): ResearchProduct[] => {
    if (target.originView === 'hunting') {
      return liveResults;
    }
    if (target.originView === 'saved') {
      return savedRecords.map((rec) => rec.product);
    }
    // For history origin, prefer the matching history session's products if available
    const matchedHistory = researchHistory.find((rec) =>
      rec.products.some(
        (p) =>
          p.id === target.originalProductId ||
          getCanonicalProductId(p) === target.canonicalProductId
      )
    );
    return matchedHistory ? matchedHistory.products : liveResults;
  };

  const executeDeepDiveForTarget = async (
    target: DeepDiveSourceContext,
    analysisIds: DeepDiveAnalysisId[],
    forceRefresh = false,
    userConfirmedPaidExecution = false
  ) => {
    if (analysisIds.length === 0) return;
    const key = target.canonicalProductId;
    const runnableIds = Array.from(new Set(analysisIds)).filter(
      (id) => !deepDiveInFlightKeysRef.current.has(`${key}:${id}`)
    );
    if (runnableIds.length === 0) return;

    const lockKeys = runnableIds.map((id) => `${key}:${id}`);
    for (const lk of lockKeys) {
      deepDiveInFlightKeysRef.current.add(lk);
    }

    try {
      const currentSnapshot =
        deepDiveStatesByProduct[key] ?? createInitialDeepDiveWorkspaceState();
      const peers = resolveDeepDivePeerProducts(target);
      const runTimestamp = new Date().toISOString();

      const authoritativeSpentBeforeRun =
        serverBudgetStatus.snapshot?.totalCommittedCredits ??
        currentSnapshot.totalCreditsUsedInSession ??
        0;

      const outcome = await runDeepDiveModules({
        product: target.product,
        analysisIds: runnableIds,
        peerProducts: peers,
        existingSlots: currentSnapshot.slots,
        spendingLimitCredits,
        sessionCreditsAlreadySpent: authoritativeSpentBeforeRun,
        liveBalanceCredits: creditBalance.status?.balance ?? null,
        requireExplicitConfirmation: true,
        userConfirmedPaidExecution,
        salesWeightPct,
        forceRefresh,
        onSlotUpdate: (analysisId, nextSlot) => {
          setDeepDiveStatesByProduct((prev) => {
            const current = prev[key] ?? createInitialDeepDiveWorkspaceState();
            return {
              ...prev,
              [key]: {
                ...current,
                lastAttemptedRunIds: [...runnableIds],
                lastAttemptedRunAt: runTimestamp,
                slots: {
                  ...current.slots,
                  [analysisId]: nextSlot,
                },
              },
            };
          });
        },
      });

      if (outcome.blockedReason) {
        return;
      }

      if (outcome.budgetSnapshot) {
        setServerBudgetStatus({
          loaded: true,
          storageAvailable: outcome.budgetSnapshot.storageAvailable,
          snapshot: outcome.budgetSnapshot,
          errorEn: null,
          errorMy: null,
        });
      } else if (outcome.totalKalodataApiCalls > 0 || outcome.failedIds.length > 0) {
        void refreshServerBudgetStatus();
      }

      setDeepDiveStatesByProduct((prev) => {
        const current = prev[key] ?? createInitialDeepDiveWorkspaceState();
        return {
          ...prev,
          [key]: {
            ...current,
            lastAttemptedRunIds: [...runnableIds],
            lastAttemptedRunAt: runTimestamp,
            totalCreditsUsedInSession:
              outcome.budgetSnapshot?.totalCommittedCredits ??
              Math.round(((current.totalCreditsUsedInSession ?? 0) + outcome.totalCreditsUsed) * 1000) /
                1000,
            lastRunSummary: outcome.runSummary ?? current.lastRunSummary ?? null,
          },
        };
      });

      // Phase 9.4: Persist real execution record into Browser Local Storage Deep Dive History
      const hadPriorResult = runnableIds.some((id) => Boolean(currentSnapshot.slots[id]?.result));
      const runType = forceRefresh ? 'refresh' : hadPriorResult ? 'rerun' : 'initial';
      const historyRecord = createDeepDiveHistoryRecord({
        canonicalProductId: key,
        productName: target.product.name,
        productNameMy: target.product.nameMy,
        analysisIds: runnableIds,
        slots: outcome.slots,
        runSummary: outcome.runSummary ?? null,
        runType,
        analyzedAt: outcome.runSummary?.completedAt ?? runTimestamp,
      });
      const { records: updatedHistory } = appendDeepDiveHistoryRecord(historyRecord);
      setDeepDiveHistoryByProduct((prev) => ({
        ...prev,
        [key]: updatedHistory,
      }));

      if (outcome.totalCreditsUsed > 0) {
        setBalanceRefreshSignal((n) => n + 1);
      }
    } finally {
      for (const lk of lockKeys) {
        deepDiveInFlightKeysRef.current.delete(lk);
      }
    }
  };

  const handleDeleteDeepDiveHistoryRecord = (recordId: string) => {
    if (!deepDiveTarget) return;
    const key = deepDiveTarget.canonicalProductId;
    const { records } = deleteDeepDiveHistoryRecord(key, recordId);
    setDeepDiveHistoryByProduct((prev) => ({
      ...prev,
      [key]: records,
    }));
  };

  const handleDeepDiveRunSelected = (userConfirmedPaidExecution = false) => {
    if (!deepDiveTarget) return;
    const current =
      deepDiveStatesByProduct[deepDiveTarget.canonicalProductId] ??
      createInitialDeepDiveWorkspaceState();
    if (current.selectedIds.length === 0) return;
    void executeDeepDiveForTarget(
      deepDiveTarget,
      [...current.selectedIds],
      false,
      userConfirmedPaidExecution
    );
  };

  const handleDeepDiveRunSingle = (
    id: DeepDiveAnalysisId,
    forceRefresh = false,
    userConfirmedPaidExecution = false
  ) => {
    if (!deepDiveTarget) return;
    void executeDeepDiveForTarget(deepDiveTarget, [id], forceRefresh, userConfirmedPaidExecution);
  };

  const handleAiAnalysisSaved = (productId: string, analysis: AiProductAnalysis) => {
    const targetCanonicalId = analysis.canonicalProductId;
    const matchesProduct = (item: ResearchProduct) =>
      item.id === productId ||
      (Boolean(targetCanonicalId) && getCanonicalProductId(item) === targetCanonicalId);

    setLiveResults((prev) =>
      prev.map((item) => (matchesProduct(item) ? { ...item, aiAnalysis: analysis } : item))
    );
    setSavedRecords((prev) =>
      prev.map((rec) =>
        rec.id === productId || matchesProduct(rec.product)
          ? { ...rec, product: { ...rec.product, aiAnalysis: analysis } }
          : rec
      )
    );
    setCompareItems((prev) =>
      prev.map((item) =>
        matchesProduct(item.product)
          ? { ...item, product: { ...item.product, aiAnalysis: analysis } }
          : item
      )
    );
    setActiveReport((prev) =>
      prev && matchesProduct(prev.product)
        ? { ...prev, product: { ...prev.product, aiAnalysis: analysis } }
        : prev
    );
  };

  /**
   * Phase 4: Propagates newly enriched Product/Shop/Review data across live results,
   * saved products, and active drawer — automatically reusing fetched Shop Detail across
   * ALL other products sharing the exact same Shop ID at 0 extra credits!
   */
  const handleProductEnriched = (
    updatedProduct: ResearchProduct,
    shopDetail: KalodataShopEnrichmentRecord | null,
    summary: ProductEnrichmentExecutionSummary | null
  ) => {
    const sharedShopId = shopDetail?.shopId ?? null;

    const applyUpdate = (
      item: ResearchProduct,
      peers: readonly ResearchProduct[]
    ): ResearchProduct => {
      if (item.id === updatedProduct.id) {
        return updatedProduct;
      }
      if (
        sharedShopId &&
        shopDetail &&
        !item.kalodataMetrics?.shopEnriched &&
        getCanonicalShopId(item) === sharedShopId
      ) {
        return mergeEnrichmentIntoProduct(
          item,
          { shopDetail },
          { salesWeightPct, peerProducts: peers }
        ).product;
      }
      return item;
    };

    setLiveResults((prev) => prev.map((item) => applyUpdate(item, prev)));
    setSavedRecords((prev) => {
      const savedProducts = prev.map((r) => r.product);
      return prev.map((rec) => {
        const nextProd = applyUpdate(rec.product, savedProducts);
        return nextProd !== rec.product ? { ...rec, product: nextProd } : rec;
      });
    });
    setCompareItems((prev) =>
      prev.map((item) =>
        item.product.id === updatedProduct.id
          ? { ...item, product: updatedProduct }
          : item
      )
    );
    setActiveReport((prev) =>
      prev && prev.product.id === updatedProduct.id
        ? { ...prev, product: updatedProduct, evaluation: null }
        : prev
    );

    if (summary && summary.actualApiCalls > 0) {
      setBalanceRefreshSignal((prev) => prev + 1);
    }
  };

  // Phase 5: Cross-view Multi-Product Comparison handlers (Results, Saved, History)
  const comparedKeySet = useMemo(
    () => new Set(compareItems.map((c) => c.selectionKey)),
    [compareItems]
  );

  const comparedLiveProductIds = useMemo(
    () =>
      new Set(
        compareItems
          .filter((c) => c.source === 'results')
          .map((c) => c.product.id)
      ),
    [compareItems]
  );

  const toggleCompareItem = (item: ComparisonSelectionItem) => {
    setCompareItems((prev) => {
      if (prev.some((existing) => existing.selectionKey === item.selectionKey)) {
        return prev.filter((existing) => existing.selectionKey !== item.selectionKey);
      }
      // Cap simultaneous comparison at 6 products for clean readability
      const next = [...prev, item];
      return next.length > 6 ? next.slice(next.length - 6) : next;
    });
  };

  const handleToggleCompareLiveProduct = (product: ResearchProduct) => {
    toggleCompareItem({
      selectionKey: `results:${product.id}`,
      canonicalProductId: getCanonicalProductId(product),
      product,
      source: 'results',
      sourceLabelEn: TRANSLATIONS.en.compareSourceResults,
      sourceLabelMy: TRANSLATIONS.my.compareSourceResults,
      researchDate: product.researchedAt ?? researchedAt,
    });
  };

  const handleToggleCompareSavedRecord = (record: SavedProductRecord) => {
    toggleCompareItem({
      selectionKey: `saved:${record.id}`,
      canonicalProductId: getCanonicalProductId(record.product),
      product: record.product,
      source: 'saved',
      sourceLabelEn: TRANSLATIONS.en.compareSourceSaved,
      sourceLabelMy: TRANSLATIONS.my.compareSourceSaved,
      researchDate: record.researchDate,
    });
  };

  const handleToggleCompareHistoryProduct = (
    product: ResearchProduct,
    recordId: string,
    archiveDate: string
  ) => {
    toggleCompareItem({
      selectionKey: `history:${recordId}:${product.id}`,
      canonicalProductId: getCanonicalProductId(product),
      product,
      source: 'history',
      sourceLabelEn: `${TRANSLATIONS.en.compareSourceHistory} (${archiveDate.slice(0, 10)})`,
      sourceLabelMy: `${TRANSLATIONS.my.compareSourceHistory} (${archiveDate.slice(0, 10)})`,
      researchDate: archiveDate,
    });
  };

  // Counts for decision tabs inside Hunting Results
  const queueCounts = useMemo(() => {
    let active = 0;
    let saved = 0;
    let rejected = 0;
    for (const p of liveResults) {
      if (rejectedIdSet.has(p.id)) {
        rejected += 1;
      } else {
        active += 1;
        if (savedIdSet.has(p.id)) saved += 1;
      }
    }
    return { active, saved, rejected };
  }, [liveResults, savedIdSet, rejectedIdSet]);

  // Live Phase 2 7-Factor evaluations — recalculated immediately whenever Strategy Slider changes
  const liveEvaluations = useMemo(
    () =>
      evaluateProductBatch(liveResults, {
        salesWeightPct,
        strategyPreset,
      }),
    [liveResults, salesWeightPct, strategyPreset]
  );

  // Phase 5: Multi-signal Product Decision Summaries (Score + Sales + Commission + Competition + Confidence + AI)
  const liveDecisions = useMemo(() => {
    const map = new Map<string, ProductDecisionSummary>();
    for (const product of liveResults) {
      const ev = liveEvaluations.get(product.id);
      if (ev) {
        map.set(product.id, deriveProductDecisionSummary(product, ev));
      }
    }
    return map;
  }, [liveResults, liveEvaluations]);

  // Phase 5: Multi-filtered & 8-factor sorted results (reacts instantly to Strategy Slider)
  const visibleProducts = useMemo<ResearchProduct[]>(() => {
    const queueFiltered = liveResults.filter((product) => {
      if (decisionFilter === 'active') return !rejectedIdSet.has(product.id);
      if (decisionFilter === 'saved') return savedIdSet.has(product.id);
      if (decisionFilter === 'rejected') return rejectedIdSet.has(product.id);
      return true;
    });

    const multiFiltered = filterProducts(
      queueFiltered,
      liveEvaluations,
      filters,
      liveDecisions
    );

    return sortProductsByField(
      multiFiltered,
      liveEvaluations,
      sortField,
      sortDirection
    );
  }, [
    liveResults,
    liveEvaluations,
    liveDecisions,
    decisionFilter,
    savedIdSet,
    rejectedIdSet,
    filters,
    sortField,
    sortDirection,
  ]);

  // Phase 5: 6-Category Best Product Selection computed from current visible results
  const bestSelections = useMemo(
    () =>
      visibleProducts.length > 0
        ? computeBestProductSelections(visibleProducts, liveEvaluations)
        : [],
    [visibleProducts, liveEvaluations]
  );

  const handleExportVisibleCsv = () => {
    if (visibleProducts.length === 0) return;
    const csv = buildProductsExportCsv(visibleProducts, {
      salesWeightPct,
      evaluations: liveEvaluations,
      researchDate: researchedAt,
      exportTitle: 'SiamPick Product Research Results',
      language,
    });
    triggerFileDownload(csv, 'siampick-research-results.csv', 'text/csv;charset=utf-8;');
  };

  const handleExportVisibleJson = () => {
    if (visibleProducts.length === 0) return;
    const json = buildProductsExportJson(visibleProducts, {
      salesWeightPct,
      evaluations: liveEvaluations,
      researchDate: researchedAt,
      exportTitle: 'SiamPick Product Research Results',
      language,
    });
    triggerFileDownload(
      json,
      'siampick-research-results.json',
      'application/json;charset=utf-8;'
    );
  };

  const availableResultCategories = useMemo(() => {
    const seen = new Set(liveResults.map((p) => p.category));
    return UNIVERSAL_CATEGORIES.map((c) => c.id).filter((id) => seen.has(id));
  }, [liveResults]);

  const activeCategoryLabel = activeHuntConfig
    ? activeHuntConfig.selectedCategories && activeHuntConfig.selectedCategories.length > 0
      ? activeHuntConfig.selectedCategories
          .map((cat) =>
            getCategoryLabel(cat, language, {
              short: (activeHuntConfig.selectedCategories?.length ?? 0) > 1,
            })
          )
          .slice(0, 3)
          .join(', ') +
        ((activeHuntConfig.selectedCategories.length ?? 0) > 3
          ? ` +${activeHuntConfig.selectedCategories.length - 3}`
          : '')
      : activeHuntConfig.category === 'all'
        ? t.settingBothCategories
        : getCategoryLabel(activeHuntConfig.category, language)
    : '';

  const displayErrorText = huntError
    ? language === 'my' && huntError.messageMy
      ? huntError.messageMy
      : huntError.messageEn
    : null;

  const handleOpenBackupModal = (tab: BackupModalTab = 'backup') => {
    setBackupModalTab(tab);
    setBackupModalOpen(true);
  };

  const handleBackupRestoreComplete = (result: BackupRestoreResult) => {
    setSavedRecords(result.savedRecords);
    setResearchHistory(result.researchHistory);
    setDeepDiveHistoryByProduct(result.deepDiveHistoryByProduct);
    // Reset in-memory Deep Dive session cache so subsequent opens re-hydrate cleanly from restored history
    setDeepDiveStatesByProduct({});

    if (result.syncedCategories) {
      handleSyncedCategoryCacheChange(result.syncedCategories);
    }

    if (result.appliedCounts.latestSessionApplied) {
      const sess = result.latestResearchSession;
      if (sess) {
        setLiveResults(sess.products);
        setSessionMeta(sess.sessionMeta);
        setLastCostSummary(sess.lastCostSummary);
        setResearchSourceMode(sess.researchSourceMode);
        setResearchedAt(sess.researchedAt);
        setGroundingSources(sess.groundingSources);
        setSearchQueries(sess.searchQueries);
        setActiveHuntConfig(sess.activeHuntConfig);
        setRejectedIds(sess.rejectedIds);
      } else {
        setLiveResults([]);
        setSessionMeta(null);
        setLastCostSummary(null);
        setResearchSourceMode(null);
        setResearchedAt(null);
        setGroundingSources([]);
        setSearchQueries([]);
        setActiveHuntConfig(null);
        setRejectedIds([]);
      }
      setActiveReport(null);
    }

    if (result.writeErrors.length > 0) {
      setStorageAlert(result.writeErrors[0]);
    } else {
      setStorageAlert(null);
    }
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50 transition-colors">
      <Header
        activeView={activeView}
        activeCategory={filters.category}
        onGoHome={handleGoHome}
        onSelectCategory={handleHeaderCategorySelect}
        onFocusStrategy={handleFocusSettings}
        historyCount={researchHistory.length}
        onToggleHistoryView={() => {
          setActiveView((prev) => (prev === 'history' ? 'hunting' : 'history'));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        shortlistCount={savedRecords.length}
        onToggleSavedView={() => {
          setActiveView((prev) => (prev === 'saved' ? 'hunting' : 'saved'));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenBackupModal={() => handleOpenBackupModal('backup')}
        language={language}
        onChangeLanguage={setLanguage}
        theme={theme}
        onToggleTheme={toggleTheme}
        creditBalance={creditBalance}
      />

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 pb-16 sm:pb-24">
        {/* Subtle Market Context Line */}
        <div className="mb-4">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Thailand · TikTok Shop Affiliate · THB (฿)
          </p>
        </div>

        {/* Global Local Storage Quota Alert Banner (shown on Hunting/Saved views too) */}
        {activeView !== 'history' && storageAlert && !storageAlert.ok && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-50/90 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs text-red-900 dark:text-red-200"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <div className="font-semibold">{t.historyQuotaWarningTitle}</div>
                <p className="mt-0.5 text-red-800 dark:text-red-300 leading-relaxed">
                  {language === 'my'
                    ? storageAlert.errorMy ?? storageAlert.errorEn
                    : storageAlert.errorEn}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveView('history');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-500 rounded-lg cursor-pointer whitespace-nowrap"
              >
                {t.navHistory}
              </button>
              <button
                type="button"
                onClick={() => setStorageAlert(null)}
                aria-label={t.historyQuotaWarningDismiss}
                className="text-red-700 dark:text-red-400 hover:text-red-950 dark:hover:text-red-200 p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {activeView === 'saved' ? (
          /* Dedicated Persistent Saved Products View */
          <SavedProductsView
            records={savedRecords}
            salesWeightPct={salesWeightPct}
            comparedKeys={comparedKeySet}
            onToggleCompareRecord={handleToggleCompareSavedRecord}
            onDelete={handleDeleteSaved}
            onOpenReport={handleOpenSavedReport}
            onOpenBackupRestore={handleOpenBackupModal}
            onBackToHunting={handleGoHome}
            language={language}
          />
        ) : activeView === 'history' ? (
          /* Dedicated Local Research History & Comparison View */
          <ResearchHistoryView
            records={researchHistory}
            savedCount={savedRecords.length}
            currentSalesWeightPct={salesWeightPct}
            storageAlert={storageAlert}
            onDismissStorageAlert={() => setStorageAlert(null)}
            getDecision={getDecision}
            onSaveProduct={handleSaveProductFromArchive}
            comparedKeys={comparedKeySet}
            onToggleCompareHistoryProduct={handleToggleCompareHistoryProduct}
            onOpenReport={handleOpenHistoryReport}
            onOpenDeepDive={(targetProduct, archiveDate, archiveMode) =>
              handleOpenDeepDive(targetProduct, 'history', archiveDate, archiveMode)
            }
            onDeleteRecords={handleDeleteHistoryRecords}
            onOpenBackupRestore={handleOpenBackupModal}
            onBackToHunting={handleGoHome}
            language={language}
          />
        ) : activeView === 'deep-dive' && deepDiveTarget ? (
          /* Phase 9.1: Dedicated Deep Dive Foundation Workspace (Zero API Calls, Non-Mutating) */
          <DeepDiveWorkspaceView
            context={deepDiveTarget}
            workspaceState={
              deepDiveStatesByProduct[deepDiveTarget.canonicalProductId] ??
              createInitialDeepDiveWorkspaceState()
            }
            evaluation={
              deepDiveTarget.originView === 'hunting'
                ? (liveEvaluations.get(deepDiveTarget.originalProductId) ?? null)
                : null
            }
            salesWeightPct={salesWeightPct}
            spendingLimitCredits={spendingLimitCredits}
            onSpendingLimitChange={handleSpendingLimitChange}
            liveBalanceCredits={creditBalance.status?.balance ?? null}
            serverCommittedCredits={serverBudgetStatus.snapshot?.totalCommittedCredits ?? null}
            budgetStorageUnavailable={
              serverBudgetStatus.loaded && !serverBudgetStatus.storageAvailable
            }
            budgetStorageErrorEn={serverBudgetStatus.errorEn}
            budgetStorageErrorMy={serverBudgetStatus.errorMy}
            onToggleOption={handleDeepDiveToggleOption}
            onSelectAll={handleDeepDiveSelectAll}
            onClearAll={handleDeepDiveClearAll}
            onToggleExpand={handleDeepDiveToggleExpand}
            onRunSelected={handleDeepDiveRunSelected}
            onRunSingle={handleDeepDiveRunSingle}
            historyRecords={deepDiveHistoryByProduct[deepDiveTarget.canonicalProductId] ?? []}
            onDeleteHistoryRecord={handleDeleteDeepDiveHistoryRecord}
            onBack={() => {
              setActiveView(deepDiveTarget.originView);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenProductDetail={() => {
              setActiveReport({
                product: deepDiveTarget.product,
                researchDate: deepDiveTarget.researchDate,
                evaluation:
                  deepDiveTarget.originView === 'hunting'
                    ? (liveEvaluations.get(deepDiveTarget.originalProductId) ?? null)
                    : null,
                peerProducts:
                  deepDiveTarget.originView === 'hunting' ? liveResults : undefined,
                sourceView: deepDiveTarget.originView,
              });
            }}
            language={language}
          />
        ) : (
          <>
            {/* Focused Editorial Header */}
            <section className="max-w-3xl">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 leading-[1.18] text-balance">
                  {t.heroTitle}
                </h1>
                <InfoPopover
                  variant="info"
                  label={t.heroTitle}
                  title={t.heroTitle}
                  content={t.heroSubtitle}
                />
              </div>
            </section>

            {/* Product Research Settings Panel */}
            <div ref={settingsSectionRef} className="scroll-mt-20">
              <ResearchSettingsPanel
                selectedCategories={selectedCategories}
                onToggleCategory={handleToggleSettingsCategory}
                onSelectAllVerifiedCategories={handleSelectAllVerifiedCategories}
                onClearAllCategories={handleClearAllCategories}
                syncedCategoryCache={syncedCategoryCache}
                onSyncedCategoryCacheChange={handleSyncedCategoryCacheChange}
                selectedSubcategoryIds={selectedSubcategoryIds}
                onToggleSubcategory={handleToggleSubcategory}
                onClearSubcategories={handleClearSubcategories}
                onBalanceRefresh={() => setBalanceRefreshSignal((prev) => prev + 1)}
                bothCategoryMode={bothCategoryMode}
                onBothCategoryModeChange={setBothCategoryMode}
                researchMode={researchMode}
                onResearchModeChange={setResearchMode}
                deepDiveCount={deepDiveCount}
                onDeepDiveCountChange={setDeepDiveCount}
                includeReviewInsights={includeReviewInsights}
                onIncludeReviewInsightsChange={setIncludeReviewInsights}
                strategyPreset={strategyPreset}
                salesWeightPct={salesWeightPct}
                onSelectStrategyPreset={handleSelectStrategyPreset}
                onCustomWeightChange={handleCustomWeightChange}
                showFineTune={showFineTune}
                onToggleFineTune={() => setShowFineTune((prev) => !prev)}
                quantity={quantity}
                onQuantityChange={setQuantity}
                spendingLimitCredits={spendingLimitCredits}
                onSpendingLimitChange={handleSpendingLimitChange}
                myanmarLanguageOnly={myanmarLanguageOnly}
                onMyanmarLanguageOnlyChange={setMyanmarLanguageOnly}
                myanmarVideoScanPages={myanmarVideoScanPages}
                onMyanmarVideoScanPagesChange={setMyanmarVideoScanPages}
                lastCostSummary={lastCostSummary}
                isHunting={isHunting}
                quotaStatus={quotaStatus}
                onPauseResearch={handlePauseResearch}
                onResumeResearch={handleResumeResearch}
                onConfirmStartHunting={() => handleStartHunting(false)}
                language={language}
              />
            </div>

            {/* Phase 10A: TikTok Shop Product Link Import & Identification */}
            <ProductLinkImportPanel
              language={language}
              spendingLimitCredits={spendingLimitCredits}
              salesWeightPct={salesWeightPct}
              syncedCategoryCache={syncedCategoryCache}
              quotaStatus={quotaStatus}
              existingResultIds={liveResults.map((p) => getCanonicalProductId(p))}
              existingSavedIds={savedRecords.map((r) => getCanonicalProductId(r.product))}
              existingHistoryIds={researchHistory.flatMap((rec) =>
                rec.products.map((p) => getCanonicalProductId(p))
              )}
              budgetStorageAvailable={serverBudgetStatus.storageAvailable}
              serverBudgetRemainingCredits={
                serverBudgetStatus.snapshot?.remainingCredits ?? null
              }
              liveBalanceCredits={creditBalance.status?.balance ?? null}
              onFindExistingProduct={findWorkspaceProductByCanonicalId}
              onRestoreExistingToResults={handleRestoreExistingProductToResults}
              onOpenExistingReport={handleOpenResultReport}
              onProductImported={handleProductImportedFromLink}
              onResumeResearch={handleResumeResearch}
              onScrollToResults={() => {
                resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />

            {/* Kalodata Open Center Free Credit Balance Check */}
            <KalodataBalanceBar language={language} balanceState={creditBalance} />

            {/* Research Results Interface */}
            <section
              id="catalog-section"
              ref={resultsSectionRef}
              aria-labelledby="results-section-heading"
              className="mt-12 scroll-mt-20"
            >
              {/* Section Title + Session Timestamp */}
              <div className="flex flex-wrap items-baseline justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-baseline gap-2.5">
                  <h2
                    id="results-section-heading"
                    className="font-display text-xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50"
                  >
                    {t.resultsSectionHeading}
                  </h2>
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                    ({visibleProducts.length})
                  </span>
                </div>

                {researchedAt && !isHunting && (
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {t.savedResearchDateLabel}: {formatResearchDate(researchedAt, language)}
                  </span>
                )}
              </div>

              {/* Transparent 7-Factor Product Scoring Engine Guide & Strategy Weights */}
              <ScoringRubricPanel
                isOpen={rubricOpen}
                onToggle={() => setRubricOpen((prev) => !prev)}
                salesWeightPct={salesWeightPct}
                language={language}
              />

              {/* Live Strategy Slider Bar (Recalculates Scores & Re-Sorts Results Instantly) */}
              {!isHunting && liveResults.length > 0 && (
                <div className="mt-4 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-4 sm:px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 mr-1">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
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
                        onClick={() => handleSelectStrategyPreset(preset.id)}
                        className={`min-h-[32px] px-3 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                          strategyPreset === preset.id
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
                          {100 - salesWeightPct}%
                        </strong>
                      </span>
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {t.salesWeight}{' '}
                        <strong className="font-mono text-zinc-950 dark:text-zinc-50 tabular-nums">
                          {salesWeightPct}%
                        </strong>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      step={5}
                      value={salesWeightPct}
                      onChange={(e) => handleCustomWeightChange(Number(e.target.value))}
                      aria-label={t.strategyLabel}
                      className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-950 dark:accent-zinc-100"
                    />
                  </div>
                </div>
              )}

              {/* Manual Research Paused Banner */}
              {!isHunting && quotaStatus.paused && (
                <div
                  role="status"
                  className="mt-4 p-5 bg-white dark:bg-zinc-900 border border-amber-300/90 dark:border-amber-700/70 rounded-xl flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <PauseCircle
                      className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="space-y-1.5 text-xs sm:text-sm">
                      <h3 className="font-semibold text-zinc-950 dark:text-zinc-50">
                        {t.manualPausedTitle}
                      </h3>
                      <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {t.manualPausedDesc}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-start">
                    <button
                      type="button"
                      onClick={() => {
                        handleResumeResearch();
                        handleFocusSettings();
                      }}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-lg hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <PlayCircle className="w-4 h-4" aria-hidden="true" />
                      <span>{t.btnResumeAndRetry}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Kalodata OpenAPI Verified Sources Summary */}
              {!isHunting && liveResults.length > 0 && groundingSources.length > 0 && (
                <div className="mt-4 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs min-w-0">
                      <Globe className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
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
                            {sessionMeta &&
                              sessionMeta.verifiedProductCount < sessionMeta.requestedQuantity && (
                                <p className="text-zinc-500 dark:text-zinc-400">{t.qualityGateExcludedNote}</p>
                              )}
                          </div>
                        }
                      />
                      <span className="text-zinc-300 dark:text-zinc-600" aria-hidden="true">·</span>
                      <span className="font-mono text-zinc-600 dark:text-zinc-400 tabular-nums">
                        {groundingSources.length} {t.groundingSourcesCount}
                      </span>
                      {sessionMeta && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-600" aria-hidden="true">·</span>
                          <span className="font-mono text-zinc-700 dark:text-zinc-300 tabular-nums">
                            {sessionMeta.verifiedProductCount}/{sessionMeta.requestedQuantity}{' '}
                            {t.qualityGateVerifiedLabel}
                          </span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setGroundingOpen((prev) => !prev)}
                      aria-expanded={groundingOpen}
                      className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer shrink-0 whitespace-nowrap py-1"
                    >
                      <span>{groundingOpen ? t.groundingToggleHide : t.groundingToggleShow}</span>
                      {groundingOpen ? (
                        <ChevronUp className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>

                  {(researchSourceMode === 'kalodata-openapi' || researchSourceMode === null) &&
                    lastCostSummary && (
                      <div className="px-4 sm:px-5 py-2.5 bg-zinc-50/80 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800/70 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-zinc-700 dark:text-zinc-300">
                        <span className="font-sans font-semibold text-zinc-900 dark:text-zinc-100">
                          {lastCostSummary.researchMode === 'deep'
                            ? t.modeDeepTitle
                            : lastCostSummary.researchMode === 'balanced'
                              ? t.modeBalancedTitle
                              : t.modeFastTitle}
                        </span>
                        <span>
                          {[
                            lastCostSummary.rankApiCalls > 0
                              ? `${t.breakdownRankLabel}: ${lastCostSummary.rankApiCalls}`
                              : null,
                            (lastCostSummary.videoRankApiCalls ?? 0) > 0
                              ? `${t.breakdownVideoRankLabel}: ${lastCostSummary.videoRankApiCalls}`
                              : null,
                            lastCostSummary.productDetailApiCalls > 0
                              ? `${t.breakdownDetailLabel}: ${lastCostSummary.productDetailApiCalls}`
                              : null,
                            lastCostSummary.shopDetailApiCalls > 0
                              ? `${t.breakdownShopLabel}: ${lastCostSummary.shopDetailApiCalls}`
                              : null,
                            lastCostSummary.commentInsightApiCalls > 0
                              ? `${t.breakdownReviewLabel}: ${lastCostSummary.commentInsightApiCalls}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {lastCostSummary.geminiAnalysisApplied && (
                          <span className="font-sans text-emerald-700 dark:text-emerald-400 font-medium">
                            {t.geminiAnalysisActiveLabel}
                          </span>
                        )}
                        <span>
                          {t.estimatedCostLabel}: {formatCredits(lastCostSummary.estimatedCredits)}{' '}
                          {t.creditsUnit} (≈ {formatUsd(lastCostSummary.estimatedUsd)})
                        </span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          {t.actualCostLabel}:{' '}
                          {lastCostSummary.actualCredits !== null
                            ? `${formatCredits(lastCostSummary.actualCredits)} ${t.creditsUnit} (≈ ${formatUsd(lastCostSummary.actualUsd ?? 0)} · ${lastCostSummary.actualApiCalls} ${t.actualCallsLabel})`
                            : t.actualCostUnavailable}
                        </span>
                      </div>
                    )}

                  {groundingOpen && (
                    <div className="border-t border-zinc-100 dark:border-zinc-800/70 px-4 sm:px-5 pb-4 pt-3 space-y-3">
                      {searchQueries.length > 0 && (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300 mr-1.5">
                            {t.groundingQueriesLabel}:
                          </span>
                          <span>{searchQueries.join(' · ')}</span>
                        </div>
                      )}
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                        {groundingSources.map((src, idx) => {
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
                    </div>
                  )}
                </div>
              )}

              {/* Phase 5: Best Product Selection Highlights (6 Categories with Sufficiency Guards) */}
              {!isHunting && bestSelections.length > 0 && (
                <BestProductsStrip
                  selections={bestSelections}
                  comparedIds={comparedLiveProductIds}
                  onOpenReport={handleOpenResultReport}
                  onToggleCompare={handleToggleCompareLiveProduct}
                  language={language}
                />
              )}

              {/* Phase 5: 8-Field Sort + Highest/Lowest + 9-Criteria Multi-Filter + Export CSV/JSON */}
              <ProductFilterBar
                filters={filters}
                onChangeFilters={setFilters}
                decisionFilter={decisionFilter}
                onChangeDecisionFilter={setDecisionFilter}
                queueCounts={queueCounts}
                sortField={sortField}
                onChangeSortField={setSortField}
                sortDirection={sortDirection}
                onToggleSortDirection={() =>
                  setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                }
                exportDisabled={isHunting || visibleProducts.length === 0}
                onExportCsv={handleExportVisibleCsv}
                onExportJson={handleExportVisibleJson}
                availableCategories={availableResultCategories}
                language={language}
              />

              {/* Error State (Propagated honestly from server — never replaced with fake results) */}
              {displayErrorText && !isHunting && (
                <div
                  role="alert"
                  className="mt-6 bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-800/60 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                        {t.huntingErrorTitle}
                      </h3>
                      <p className="mt-1 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {displayErrorText}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleFocusSettings}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-lg hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.huntingRetryBtn}</span>
                  </button>
                </div>
              )}

              {/* Phase 9 Method 1: Honest Myanmar Video-First Discovery Scope Strip */}
              {!isHunting &&
                sessionMeta?.myanmarFilterApplied &&
                sessionMeta.myanmarVideoDiscovery && (() => {
                  const vStats = sessionMeta.myanmarVideoDiscovery!;
                  const hasShortfall =
                    vStats.affiliateProductsVerified < vStats.requestedQuantity;
                  return (
                    <div className="mt-5 p-4 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl space-y-2.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {t.myanmarVideoDiscoveryBarTitle}
                        </span>
                        <span
                          className={`font-mono text-[11px] font-semibold ${
                            vStats.stopReason === 'target-reached'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {t.myanmarVideoStopReasonLabels[vStats.stopReason]}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 font-mono tabular-nums">
                        <div className="px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800/70">
                          <div className="font-sans text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                            {t.myanmarVideoStatPagesScanned}
                          </div>
                          <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                            {vStats.videoPagesScanned}/{vStats.maxVideoScanPages}
                          </div>
                        </div>
                        <div className="px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800/70">
                          <div className="font-sans text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                            {t.myanmarVideoStatVideosScanned}
                          </div>
                          <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                            {vStats.totalVideosScanned.toLocaleString('en-US')}
                          </div>
                        </div>
                        <div className="px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800/70">
                          <div className="font-sans text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                            {t.myanmarVideoStatMatchedVideos}
                          </div>
                          <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                            {vStats.matchedMyanmarVideos}
                          </div>
                        </div>
                        <div className="px-2.5 py-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-200/80 dark:border-emerald-800/60">
                          <div className="font-sans text-[10px] text-emerald-800 dark:text-emerald-300 truncate">
                            {t.myanmarVideoStatCollectedProducts}
                          </div>
                          <div className="mt-0.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                            {vStats.affiliateProductsVerified}/{vStats.requestedQuantity}
                          </div>
                        </div>
                        <div className="px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800/70">
                          <div className="font-sans text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                            {t.myanmarVideoStatSkippedNonAff}
                          </div>
                          <div className="mt-0.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                            {vStats.nonAffiliateOrUnavailableSkipped}
                          </div>
                        </div>
                      </div>

                      {hasShortfall && (
                        <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                          {t.myanmarVideoShortfallNotice}
                        </p>
                      )}
                    </div>
                  );
                })()}

              {/* Phase 9 Legacy: Honest Myanmar Review Discovery Scope Strip (when review-first ran) */}
              {!isHunting && sessionMeta?.myanmarFilterApplied && sessionMeta.myanmarReviewDiscovery && (() => {
                const stats = sessionMeta.myanmarReviewDiscovery!;
                const isPartial = stats.candidatesCheckedForReviews < stats.totalCandidatesFound;
                return (
                  <div className="mt-5 p-4 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {t.myanmarDiscoveryBarTitle}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                        {t.myanmarStatReviewsInspected}:{' '}
                        <strong className="text-zinc-900 dark:text-zinc-100">{stats.totalReviewsInspected}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 font-mono tabular-nums">
                      <div className="px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800/70">
                        <div className="font-sans text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                          {t.myanmarStatCandidatesFound}
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          {stats.totalCandidatesFound}
                        </div>
                      </div>
                      <div className="px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800/70">
                        <div className="font-sans text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                          {t.myanmarStatCheckedReviews}
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          {stats.candidatesCheckedForReviews}
                        </div>
                      </div>
                      <div className="px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800/70">
                        <div className="font-sans text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                          {t.myanmarStatReviewsAvailable}
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          {stats.productsWithReviewsAvailable}
                        </div>
                      </div>
                      <div className="px-2.5 py-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-800/50">
                        <div className="font-sans text-[10px] text-amber-800 dark:text-amber-300 truncate">
                          {t.myanmarStatReviewUnavailable}
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
                          {stats.productsReviewUnavailable}
                        </div>
                      </div>
                      <div className="px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800/70">
                        <div className="font-sans text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                          {t.myanmarStatNoMyanmarReview}
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                          {stats.productsNoMyanmarReview}
                        </div>
                      </div>
                      <div className="px-2.5 py-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-200/80 dark:border-emerald-800/60">
                        <div className="font-sans text-[10px] text-emerald-800 dark:text-emerald-300 truncate">
                          {t.myanmarStatMatchedProducts}
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                          {stats.matchedMyanmarReviewProducts}
                        </div>
                      </div>
                    </div>

                    {isPartial && (
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                        {t.myanmarDiscoveryPartialNotice}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Results Body: Loading vs Empty Ready State vs Filtered Empty vs Live Card Grid */}
              <div className="mt-6">
                {isHunting ? (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-6 py-16 text-center">
                    <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 inline-flex items-center justify-center mb-4">
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                    </div>
                    <h3 className="font-display text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                      {t.huntingLoadingTitle}
                    </h3>
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto leading-relaxed">
                      {t.huntingLoadingDesc}
                    </p>
                    {activeHuntConfig && (
                      <div className="mt-5 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 text-xs text-zinc-700 dark:text-zinc-300">
                        <span className="font-medium text-zinc-950 dark:text-zinc-50">
                          {activeHuntConfig.market}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{activeCategoryLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums font-medium text-zinc-950 dark:text-zinc-50">
                          {activeHuntConfig.quantity} {t.quantityProductsUnit}
                        </span>
                      </div>
                    )}
                    <div className="mt-6">
                      <button
                        type="button"
                        onClick={handleCancelHunting}
                        className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:text-zinc-950 dark:hover:text-zinc-50 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer"
                      >
                        {t.huntingCancelBtn}
                      </button>
                    </div>
                  </div>
                ) : liveResults.length === 0 ? (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-6 py-14 sm:py-16 text-center">
                    <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 inline-flex items-center justify-center mb-4">
                      <SearchCheck className="w-5 h-5" aria-hidden="true" />
                    </div>

                    <h3 className="font-display text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                      {sessionMeta?.myanmarFilterApplied
                        ? t.myanmarEmptyTitle
                        : t.emptyLiveTitle}
                    </h3>
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto leading-relaxed">
                      {sessionMeta?.myanmarFilterApplied
                        ? t.myanmarEmptyDesc
                        : t.emptyLiveDesc}
                    </p>
                    {sessionMeta?.myanmarFilterApplied &&
                      !sessionMeta.myanmarReviewDiscovery &&
                      !sessionMeta.myanmarVideoDiscovery &&
                      typeof sessionMeta.myanmarCandidatesScanned === 'number' && (
                        <p className="mt-3 font-mono text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
                          {t.myanmarEmptyScannedPrefix}{' '}
                          <strong className="text-zinc-950 dark:text-zinc-50">
                            {sessionMeta.myanmarCandidatesScanned}
                          </strong>
                        </p>
                      )}

                    <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                      {sessionMeta?.myanmarFilterApplied ? (
                        <button
                          type="button"
                          onClick={() => {
                            setMyanmarLanguageOnly(false);
                            handleFocusSettings();
                          }}
                          className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-lg hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" aria-hidden="true" />
                          <span>{t.myanmarTurnOffFilterBtn}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleFocusSettings}
                          className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-lg hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer"
                        >
                          <span>
                            {quotaStatus.paused ? t.btnResumeAndRetry : t.emptyStartBtn}
                          </span>
                          <ArrowRight className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}

                      {researchHistory.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveView('history');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
                        >
                          <History className="w-4 h-4 text-zinc-600 dark:text-zinc-400" aria-hidden="true" />
                          <span>
                            {t.historyViewTitle} ({researchHistory.length})
                          </span>
                        </button>
                      )}

                      {savedRecords.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveView('saved');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
                        >
                          <span>
                            {t.savedViewTitle} ({savedRecords.length})
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenBackupModal('restore')}
                        className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
                      >
                        <Upload className="w-4 h-4 text-zinc-600 dark:text-zinc-400" aria-hidden="true" />
                        <span>
                          {language === 'my' ? 'Backup မှ ပြန်ယူမည်' : 'Restore Backup'}
                        </span>
                      </button>
                    </div>
                  </div>
                ) : visibleProducts.length === 0 ? (
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
                        setFilters({ ...DEFAULT_PRODUCT_FILTERS });
                        setDecisionFilter('active');
                      }}
                      className="mt-5 inline-flex items-center gap-2 min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-lg hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" aria-hidden="true" />
                      <span>{t.resetViewBtn}</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visibleProducts.map((product) => (
                      <ResearchResultCard
                        key={product.id}
                        product={product}
                        evaluation={liveEvaluations.get(product.id)}
                        decisionSummary={liveDecisions.get(product.id)}
                        salesWeightPct={salesWeightPct}
                        peerProducts={liveResults}
                        decision={getDecision(product.id)}
                        onSave={handleToggleSave}
                        onReject={handleToggleReject}
                        onOpenReport={handleOpenResultReport}
                        onOpenDeepDive={(targetProduct) =>
                          handleOpenDeepDive(
                            targetProduct,
                            'hunting',
                            targetProduct.researchedAt ?? researchedAt
                          )
                        }
                        isCompared={comparedLiveProductIds.has(product.id)}
                        onToggleCompare={handleToggleCompareLiveProduct}
                        language={language}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Compact Cross-View Comparison Tray Bar (appears only when user selects products to compare) */}
      {compareItems.length > 0 && !comparisonModalOpen && (
        <div className="sticky bottom-3 z-30 mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8 pointer-events-none">
          <div className="pointer-events-auto bg-zinc-950 dark:bg-zinc-900 dark:border dark:border-zinc-700 text-white rounded-xl px-4 py-2.5 shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <GitCompareArrows className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
              <span className="font-medium truncate">
                {t.compareBarTitle}:{' '}
                <strong className="font-mono tabular-nums">{compareItems.length}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCompareItems([])}
                className="px-2.5 py-1.5 text-zinc-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                {t.compareClearBtn}
              </button>
              <button
                type="button"
                onClick={() => setComparisonModalOpen(true)}
                className="inline-flex items-center gap-1.5 min-h-[34px] px-3.5 py-1.5 font-medium text-zinc-950 bg-white hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>
                  {t.compareOpenBtn} ({compareItems.length})
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quiet Minimal Footer */}
      <footer className="border-t border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{t.footerNote}</span>
          <span>{t.marketScope}</span>
        </div>
      </footer>

      {/* Phase 5: Multi-Product Side-by-Side Comparison Modal (Results + Saved + History) */}
      <ProductComparisonModal
        isOpen={comparisonModalOpen}
        items={compareItems}
        savedRecords={savedRecords}
        salesWeightPct={salesWeightPct}
        onRemoveItem={(key) =>
          setCompareItems((prev) => prev.filter((item) => item.selectionKey !== key))
        }
        onAddSavedRecord={handleToggleCompareSavedRecord}
        onClearAll={() => {
          setCompareItems([]);
          setComparisonModalOpen(false);
        }}
        onOpenReport={(item) => {
          setComparisonModalOpen(false);
          if (item.source === 'saved') {
            const matchedSaved = savedRecords.find((r) => r.id === item.product.id);
            if (matchedSaved) {
              handleOpenSavedReport(matchedSaved);
              return;
            }
          }
          if (item.source === 'history') {
            const comparisonPeers = compareItems.map((c) => c.product);
            handleOpenHistoryReport(
              item.product,
              item.researchDate ?? item.product.researchedAt ?? new Date().toISOString(),
              undefined,
              comparisonPeers
            );
            return;
          }
          handleOpenResultReport(item.product);
        }}
        onClose={() => setComparisonModalOpen(false)}
        language={language}
      />

      {/* Detailed Research Report Drawer (Works from Hunting Results, History Archives, and Saved Products) */}
      <ResearchReportDrawer
        product={activeReport?.product ?? null}
        evaluation={
          activeReport
            ? activeReport.sourceView === 'hunting'
              ? (liveEvaluations.get(activeReport.product.id) ?? null)
              : (activeReport.evaluation ?? null)
            : null
        }
        salesWeightPct={salesWeightPct}
        peerProducts={activeReport?.peerProducts}
        spendingLimitCredits={spendingLimitCredits}
        researchDate={activeReport?.researchDate ?? null}
        decision={activeReport ? getDecision(activeReport.product.id) : 'pending'}
        onSave={handleToggleSave}
        onReject={handleToggleReject}
        onOpenDeepDive={(targetProduct) =>
          handleOpenDeepDive(
            targetProduct,
            activeReport?.sourceView === 'saved'
              ? 'saved'
              : activeReport?.sourceView === 'history'
                ? 'history'
                : 'hunting',
            activeReport?.researchDate ?? targetProduct.researchedAt ?? researchedAt,
            activeReport?.researchMode
          )
        }
        onClose={() => setActiveReport(null)}
        onAiAnalysisSaved={handleAiAnalysisSaved}
        onProductEnriched={handleProductEnriched}
        language={language}
      />

      {/* Backup & Restore Modal */}
      <BackupRestoreModal
        isOpen={backupModalOpen}
        initialTab={backupModalTab}
        onClose={() => setBackupModalOpen(false)}
        onRestoreComplete={handleBackupRestoreComplete}
        language={language}
        savedCount={savedRecords.length}
        historyCount={researchHistory.length}
      />
    </div>
  );
}
