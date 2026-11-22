import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  GitCompareArrows,
  History,
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
  LinkImportInspectResponse,
  OpportunityEvaluation,
  ProductCategory,
  ProductDecision,
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
  SingleProductHistoryRecord,
  SortDirection,
  StorageWriteResult,
  StrategyPreset,
  SyncedKalodataCategoryCache,
} from './types/product';
import {
  DEFAULT_DEEP_DIVE_COUNT,
  DEFAULT_MYANMAR_VIDEO_SCAN_PAGES,
  DEFAULT_SPENDING_LIMIT_CREDITS,
  MAX_SPENDING_LIMIT_CREDITS,
  MIN_SPENDING_LIMIT_CREDITS,
} from './utils/kalodataPricing';
import {
  buildResolvedCategoryIdMap,
  DEFAULT_SELECTED_CATEGORIES,
  getSelectableCategories,
  loadSyncedKalodataCategories,
} from './utils/categoryRegistry';
import { evaluateProductBatch, getCanonicalProductId } from './utils/scoring';
import { DEFAULT_PRODUCT_FILTERS } from './utils/productAnalytics';
import { getScrollBehavior } from './hooks/useDialogA11y';
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
import {
  createSingleProductHistoryRecord,
  createSingleProductHistoryRecordFromExisting,
  deleteSingleProductHistoryRecords,
  loadSingleProductHistory,
  persistSingleProductHistory,
  syncProductInSingleHistory,
  upsertSingleProductHistoryRecord,
} from './utils/singleProductHistoryStorage';
import { TRANSLATIONS } from './i18n/translations';
import { Header } from './components/Header';
import { MobileBottomNav } from './components/MobileBottomNav';
import { StateMessage } from './components/visual';
import { ResearchReportDrawer } from './components/ResearchReportDrawer';
import { SavedProductsView } from './components/SavedProductsView';
import { ResearchHistoryView, type HistoryTab } from './components/ResearchHistoryView';
import { ProductComparisonModal } from './components/ProductComparisonModal';
import { BackupRestoreModal, type BackupModalTab } from './components/BackupRestoreModal';
import type { BackupRestoreResult } from './utils/backupStorage';
import { InfoPopover } from './components/InfoPopover';
import { DiscoveryLauncher, type DiscoveryLauncherTab } from './components/DiscoveryLauncher';
import { HuntingResultsSection } from './components/HuntingResultsSection';
import { DeepDiveWorkspaceView } from './components/DeepDiveWorkspaceView';
import { useTheme } from './hooks/useTheme';
import { useKalodataBalance } from './hooks/useKalodataBalance';
import type {
  DeepDiveAnalysisId,
  DeepDiveHistoryRecord,
  DeepDiveOriginView,
  DeepDiveServerBudgetSnapshot,
  DeepDiveSourceContext,
  DeepDiveVideoCreativeOptions,
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
const BATCH_SPENDING_LIMIT_STORAGE_KEY = 'siampick_batch_limit_credits_v1';
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

function loadSavedLimitByKey(storageKey: string, fallbackKey?: string): number {
  try {
    const raw =
      window.localStorage.getItem(storageKey) ??
      (fallbackKey ? window.localStorage.getItem(fallbackKey) : null);
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
  const deferredSalesWeightPct = useDeferredValue(salesWeightPct);
  const deferredStrategyPreset = useDeferredValue(strategyPreset);
  const [quantity, setQuantity] = useState<ResearchQuantity>(10);
  const [batchSpendingLimitCredits, setBatchSpendingLimitCredits] = useState<number>(() =>
    loadSavedLimitByKey(BATCH_SPENDING_LIMIT_STORAGE_KEY, SPENDING_LIMIT_STORAGE_KEY)
  );
  const [dailyBudgetLimitCredits, setDailyBudgetLimitCredits] = useState<number>(() =>
    loadSavedLimitByKey(SPENDING_LIMIT_STORAGE_KEY)
  );
  const [myanmarLanguageOnly, setMyanmarLanguageOnly] = useState<boolean>(false);
  const [myanmarVideoScanPages, setMyanmarVideoScanPages] = useState<number>(
    DEFAULT_MYANMAR_VIDEO_SCAN_PAGES
  );
  const [launcherTab, setLauncherTab] = useState<DiscoveryLauncherTab>('batch');

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
  const [batchSettingsExpanded, setBatchSettingsExpanded] = useState<boolean>(
    () => !initialSession || initialSession.products.length === 0
  );

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

  // Report Drawer
  const [activeReport, setActiveReport] = useState<ActiveReportState | null>(null);

  // Phase 9.1 / 9.4: Deep Dive Foundation & Per-Product Browser History (Zero mutation of original results)
  const [deepDiveTarget, setDeepDiveTarget] = useState<DeepDiveSourceContext | null>(null);
  const [deepDiveStatesByProduct, setDeepDiveStatesByProduct] = useState<
    Record<string, DeepDiveWorkspaceState>
  >({});
  const [deepDiveHistoryByProduct, setDeepDiveHistoryByProduct] = useState<
    Record<string, DeepDiveHistoryRecord[]>
  >(() => loadAllDeepDiveHistoryByProduct());

  // Single Product Research History (strictly separate storage key & cap from Batch Research History and Batch Recent Results)
  const [singleProductHistory, setSingleProductHistory] = useState<SingleProductHistoryRecord[]>(
    () => loadSingleProductHistory()
  );
  const [activeSingleLinkResult, setActiveSingleLinkResult] =
    useState<SingleProductHistoryRecord | null>(null);
  const [historyInitialTab, setHistoryInitialTab] = useState<HistoryTab>('records');

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

  // Persist user language preference across refreshes & sync <html lang> for script-aware typography
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore storage unavailability
    }
  }, [language]);

  // Persist user Daily Budget Limit & Batch Per-Search Limit across refreshes
  useEffect(() => {
    try {
      window.localStorage.setItem(SPENDING_LIMIT_STORAGE_KEY, String(dailyBudgetLimitCredits));
    } catch {
      // Ignore storage unavailability
    }
  }, [dailyBudgetLimitCredits]);

  useEffect(() => {
    try {
      window.localStorage.setItem(BATCH_SPENDING_LIMIT_STORAGE_KEY, String(batchSpendingLimitCredits));
    } catch {
      // Ignore storage unavailability
    }
  }, [batchSpendingLimitCredits]);

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
          setDailyBudgetLimitCredits(data.budget.configuredLimitCredits);
        }
      }
    } catch {
      // Transient network error on initial check; server still enforces fail-closed on paid requests
    }
  };

  useEffect(() => {
    void refreshServerBudgetStatus();
  }, []);

  const handleBatchSpendingLimitChange = (nextLimit: number) => {
    if (!Number.isFinite(nextLimit)) return;
    const clamped =
      Math.round(
        Math.max(MIN_SPENDING_LIMIT_CREDITS, Math.min(MAX_SPENDING_LIMIT_CREDITS, nextLimit)) * 1000
      ) / 1000;
    setBatchSpendingLimitCredits(clamped);
  };

  const handleDailyBudgetLimitChange = (nextLimit: number) => {
    if (!Number.isFinite(nextLimit)) return;
    const clamped =
      Math.round(
        Math.max(MIN_SPENDING_LIMIT_CREDITS, Math.min(MAX_SPENDING_LIMIT_CREDITS, nextLimit)) * 1000
      ) / 1000;
    setDailyBudgetLimitCredits(clamped);

    // Optimistically reflect remaining budget immediately for responsive UI before server confirms
    setServerBudgetStatus((prev) => {
      if (!prev.snapshot) return prev;
      const used = prev.snapshot.totalCommittedCredits;
      return {
        ...prev,
        snapshot: {
          ...prev.snapshot,
          configuredLimitCredits: clamped,
          effectiveLimitCredits: clamped,
          remainingCredits: Math.max(0, Math.round((clamped - used) * 1000) / 1000),
        },
      };
    });

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
    if (activeSingleLinkResult && activeSingleLinkResult.product.id === id) {
      return activeSingleLinkResult.product;
    }
    const inSingle = singleProductHistory.find((r) => r.product.id === id);
    if (inSingle) return inSingle.product;
    if (activeReport && activeReport.product.id === id) return activeReport.product;
    for (const rec of researchHistory) {
      const inHistory = rec.products.find((p) => p.id === id);
      if (inHistory) return inHistory;
    }
    return null;
  };

  const isProductSavedByIdOrCanonical = (targetProduct: ResearchProduct): boolean => {
    const targetCanonicalId = getCanonicalProductId(targetProduct);
    return savedRecords.some(
      (r) =>
        r.id === targetProduct.id ||
        (Boolean(targetCanonicalId) && getCanonicalProductId(r.product) === targetCanonicalId)
    );
  };

  const handleToggleSaveProductDirect = (targetProduct: ResearchProduct) => {
    const targetCanonicalId = getCanonicalProductId(targetProduct);
    const isCurrentlySaved = isProductSavedByIdOrCanonical(targetProduct);
    if (isCurrentlySaved) {
      setSavedRecords((prev) =>
        prev.filter(
          (r) =>
            r.id !== targetProduct.id &&
            getCanonicalProductId(r.product) !== targetCanonicalId
        )
      );
      return;
    }
    const record = createSavedRecord(targetProduct);
    setSavedRecords((prev) => [record, ...prev.filter((r) => r.id !== targetProduct.id)]);
    setRejectedIds((prev) => prev.filter((item) => item !== targetProduct.id));
  };

  const handleToggleSave = useCallback((id: string) => {
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
  }, [savedIdSet, liveResults, singleProductHistory, activeReport, researchHistory]);

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

  const handleDeleteSingleHistoryRecords = (idsToDelete: string[]) => {
    if (idsToDelete.length === 0) return;
    const deleteSet = new Set(idsToDelete);
    setSingleProductHistory((prev) => {
      const next = deleteSingleProductHistoryRecords(prev, idsToDelete);
      const writeRes = persistSingleProductHistory(next);
      if (writeRes.ok) {
        setStorageAlert(null);
      } else {
        setStorageAlert(writeRes);
      }
      return next;
    });
    setActiveSingleLinkResult((prev) =>
      prev && (deleteSet.has(prev.id) || deleteSet.has(prev.canonicalProductId)) ? null : prev
    );
  };

  const handleToggleReject = useCallback((id: string) => {
    if (rejectedIdSet.has(id)) {
      setRejectedIds((prev) => prev.filter((item) => item !== id));
      return;
    }
    setRejectedIds((prev) => [...prev, id]);
    setSavedRecords((prev) => prev.filter((r) => r.id !== id));
  }, [rejectedIdSet]);

  const handleSelectStrategyPreset = useCallback((preset: StrategyPreset) => {
    setStrategyPreset(preset);
    setSalesWeightPct(STRATEGY_WEIGHTS[preset]);
  }, []);

  const handleCustomWeightChange = useCallback((newSalesWeight: number) => {
    setSalesWeightPct(newSalesWeight);
    if (newSalesWeight >= 62) {
      setStrategyPreset('sales-first');
    } else if (newSalesWeight <= 38) {
      setStrategyPreset('commission-first');
    } else {
      setStrategyPreset('balanced');
    }
  }, []);

  const handleGoHome = () => {
    setActiveView('hunting');
    window.scrollTo({ top: 0, behavior: getScrollBehavior() });
  };

  const handleFocusSettings = useCallback(() => {
    setActiveView('hunting');
    setLauncherTab('batch');
    setBatchSettingsExpanded(true);
    window.setTimeout(() => {
      settingsSectionRef.current?.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' });
    }, 50);
  }, []);

  const handleHeaderCategorySelect = (cat: CategoryFilter) => {
    setActiveView('hunting');
    setFilters((prev) => ({ ...prev, category: cat }));
    window.setTimeout(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' });
    }, 50);
  };

  const handleCancelHunting = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsHunting(false);
  }, []);

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
      spendingLimitCredits: batchSpendingLimitCredits,
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
      resultsSectionRef.current?.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' });
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
      if (hydratedProducts.length > 0) {
        setBatchSettingsExpanded(false);
      }
      setSessionMeta(nextSessionMeta);
      setLastCostSummary(nextCostSummary);
      setBalanceRefreshSignal((prev) => prev + 1);
      setResearchSourceMode(nextSourceMode);
      setResearchedAt(nextResearchedAt);
      setGroundingSources(nextGroundingSources);
      setSearchQueries(nextSearchQueries);
      setRejectedIds([]);

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
    const inSingle = singleProductHistory.find((r) => r.canonicalProductId === cleanTarget);
    if (inSingle) return inSingle.product;
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

  /**
   * Single Product Link Research Handler:
   * Saves strictly into `siampick_single_product_history_v1` and updates the inline Single Result card.
   * NEVER modifies `liveResults` (Batch Recent Results), `researchHistory` (Batch History), or `siampick_latest_research_session_v1`.
   */
  const handleProductImportedFromLink = (result: LinkImportExecuteResponse) => {
    absorbProductsIntoEnrichmentCache([result.product]);
    const hydrated = hydrateProductFromEnrichmentCache(result.product, {
      salesWeightPct,
    }).product;

    const record = createSingleProductHistoryRecord(
      {
        ...result,
        product: hydrated,
      },
      salesWeightPct,
      strategyPreset
    );

    setActiveSingleLinkResult(record);
    setSingleProductHistory((prev) => {
      const next = upsertSingleProductHistoryRecord(prev, record);
      const writeRes = persistSingleProductHistory(next);
      if (!writeRes.ok) {
        setStorageAlert(writeRes);
        return prev;
      }
      setStorageAlert(null);
      return next;
    });

    if (result.apiCallsMade > 0) {
      setBalanceRefreshSignal((prev) => prev + 1);
      void refreshServerBudgetStatus();
    }
  };

  /**
   * Opens an already-local product match from Link Check at 0 credits inside the inline Single Result card
   * and archives/updates ONLY in Single Product History (never touches Batch Recent Results or Batch History).
   */
  const handleOpenExistingAsSingleResult = (
    product: ResearchProduct,
    inspectResult: LinkImportInspectResponse
  ) => {
    const hydrated = hydrateProductFromEnrichmentCache(product, {
      salesWeightPct,
    }).product;
    const record = createSingleProductHistoryRecordFromExisting(
      hydrated,
      inspectResult,
      salesWeightPct,
      strategyPreset
    );
    setActiveSingleLinkResult(record);
    setSingleProductHistory((prev) => {
      const next = upsertSingleProductHistoryRecord(prev, record);
      const writeRes = persistSingleProductHistory(next);
      if (!writeRes.ok) {
        setStorageAlert(writeRes);
        return prev;
      }
      setStorageAlert(null);
      return next;
    });
  };

  const handleOpenResultReport = useCallback((product: ResearchProduct) => {
    const existingSaved = savedRecords.find((r) => r.id === product.id);
    const inLive = liveResults.some((p) => p.id === product.id);
    setActiveReport({
      product,
      researchDate: existingSaved?.researchDate ?? product.researchedAt ?? researchedAt,
      evaluation: null,
      peerProducts: inLive ? liveResults : [product],
      sourceView: 'hunting',
    });
  }, [savedRecords, liveResults, researchedAt]);

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
    window.scrollTo({ top: 0, behavior: getScrollBehavior() });
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
      const inBatchResults = liveResults.some(
        (p) =>
          p.id === target.originalProductId ||
          getCanonicalProductId(p) === target.canonicalProductId
      );
      return inBatchResults ? liveResults : [target.product];
    }
    if (target.originView === 'saved') {
      return savedRecords.map((rec) => rec.product);
    }
    // For history origin, prefer the matching batch history session's products if available
    const matchedHistory = researchHistory.find((rec) =>
      rec.products.some(
        (p) =>
          p.id === target.originalProductId ||
          getCanonicalProductId(p) === target.canonicalProductId
      )
    );
    if (matchedHistory) return matchedHistory.products;
    const inSingleHistory = singleProductHistory.some(
      (rec) =>
        rec.product.id === target.originalProductId ||
        rec.canonicalProductId === target.canonicalProductId
    );
    return inSingleHistory ? [target.product] : liveResults;
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
        videoCreativeOptions: currentSnapshot.videoCreativeOptions,
        spendingLimitCredits: dailyBudgetLimitCredits,
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

  const handleDeepDiveUpdateVideoCreativeOptions = (next: DeepDiveVideoCreativeOptions) => {
    if (!deepDiveTarget) return;
    const key = deepDiveTarget.canonicalProductId;
    setDeepDiveStatesByProduct((prev) => {
      const current = prev[key] ?? createInitialDeepDiveWorkspaceState();
      return {
        ...prev,
        [key]: {
          ...current,
          videoCreativeOptions: next,
        },
      };
    });
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
    setActiveSingleLinkResult((prev) =>
      prev && matchesProduct(prev.product)
        ? { ...prev, product: { ...prev.product, aiAnalysis: analysis } }
        : prev
    );
    setSingleProductHistory((prev) => {
      const target = prev.find((r) => matchesProduct(r.product));
      if (!target) return prev;
      const next = syncProductInSingleHistory(
        prev,
        { ...target.product, aiAnalysis: analysis },
        salesWeightPct,
        strategyPreset
      );
      persistSingleProductHistory(next);
      return next;
    });
  };

  /**
   * Phase 4: Propagates newly enriched Product/Shop/Review data across live results,
   * saved products, single product link history, and active drawer — automatically reusing fetched Shop Detail across
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
    setActiveSingleLinkResult((prev) => {
      if (!prev) return prev;
      const nextProd = applyUpdate(prev.product, [prev.product]);
      return nextProd !== prev.product ? { ...prev, product: nextProd } : prev;
    });
    setSingleProductHistory((prev) => {
      const next = syncProductInSingleHistory(prev, updatedProduct, salesWeightPct, strategyPreset);
      if (next !== prev) {
        persistSingleProductHistory(next);
      }
      return next;
    });

    if (summary && summary.actualApiCalls > 0) {
      setBalanceRefreshSignal((prev) => prev + 1);
      void refreshServerBudgetStatus();
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

  const handleToggleCompareLiveProduct = useCallback((product: ResearchProduct) => {
    toggleCompareItem({
      selectionKey: `results:${product.id}`,
      canonicalProductId: getCanonicalProductId(product),
      product,
      source: 'results',
      sourceLabelEn: TRANSLATIONS.en.compareSourceResults,
      sourceLabelMy: TRANSLATIONS.my.compareSourceResults,
      researchDate: product.researchedAt ?? researchedAt,
    });
  }, [researchedAt]);

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

  // Live Phase 2 7-Factor evaluations — deferred on rapid slider scrubbing for 60fps UI responsiveness
  const liveEvaluations = useMemo(
    () =>
      evaluateProductBatch(liveResults, {
        salesWeightPct: deferredSalesWeightPct,
        strategyPreset: deferredStrategyPreset,
      }),
    [liveResults, deferredSalesWeightPct, deferredStrategyPreset]
  );

  const handleToggleSortDirection = useCallback(() => {
    setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  }, []);

  const handleOpenLiveDeepDive = useCallback(
    (targetProduct: ResearchProduct) => {
      handleOpenDeepDive(
        targetProduct,
        'hunting',
        targetProduct.researchedAt ?? researchedAt
      );
    },
    [researchedAt, activeHuntConfig, researchMode]
  );

  const handleResumeAndEditSettings = useCallback(() => {
    void handleResumeResearch();
    handleFocusSettings();
  }, [handleFocusSettings]);

  const handleTurnOffMyanmarAndEdit = useCallback(() => {
    if (sessionMeta?.myanmarFilterApplied) {
      setMyanmarLanguageOnly(false);
    }
    handleFocusSettings();
  }, [sessionMeta, handleFocusSettings]);

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
    if (result.singleProductHistory) {
      setSingleProductHistory(result.singleProductHistory);
    }
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
        historyCount={researchHistory.length + singleProductHistory.length}
        onToggleHistoryView={() => {
          setHistoryInitialTab('records');
          setActiveView((prev) => (prev === 'history' ? 'hunting' : 'history'));
          window.scrollTo({ top: 0, behavior: getScrollBehavior() });
        }}
        shortlistCount={savedRecords.length}
        onToggleSavedView={() => {
          setActiveView((prev) => (prev === 'saved' ? 'hunting' : 'saved'));
          window.scrollTo({ top: 0, behavior: getScrollBehavior() });
        }}
        onOpenBackupModal={() => handleOpenBackupModal('backup')}
        language={language}
        onChangeLanguage={setLanguage}
        theme={theme}
        onToggleTheme={toggleTheme}
        creditBalance={creditBalance}
        dailyBudgetLimitCredits={dailyBudgetLimitCredits}
        serverBudgetCommittedCredits={
          serverBudgetStatus.snapshot?.totalCommittedCredits ?? null
        }
        serverBudgetRemainingCredits={
          serverBudgetStatus.snapshot?.remainingCredits ?? null
        }
        budgetStorageAvailable={serverBudgetStatus.storageAvailable}
        onDailyBudgetLimitChange={handleDailyBudgetLimitChange}
      />

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-12 sm:pb-20">
        {/* Subtle Market Context Line (hidden inside Deep Dive where product header leads) */}
        {activeView !== 'deep-dive' && (
          <div className="mb-2.5 sm:mb-3.5">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Thailand · TikTok Shop Affiliate · THB (฿)
            </p>
          </div>
        )}

        {/* Global Local Storage Quota Alert Banner (shown on Hunting/Saved views too) */}
        {activeView !== 'history' && storageAlert && !storageAlert.ok && (
          <StateMessage
            variant="error"
            compact
            className="mb-6"
            icon={<AlertTriangle className="w-4 h-4" aria-hidden="true" />}
            title={t.historyQuotaWarningTitle}
            reason={
              language === 'my'
                ? (storageAlert.errorMy ?? storageAlert.errorEn ?? t.historyQuotaWarningTitle)
                : (storageAlert.errorEn ?? t.historyQuotaWarningTitle)
            }
            actionLabel={t.navHistory}
            onAction={() => {
              setActiveView('history');
              window.scrollTo({ top: 0, behavior: getScrollBehavior() });
            }}
          />
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
          /* Dedicated Local Research History (Batch Research + Single Product History + Comparison) */
          <ResearchHistoryView
            records={researchHistory}
            singleRecords={singleProductHistory}
            initialTab={historyInitialTab}
            onTabChange={setHistoryInitialTab}
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
            onDeleteSingleRecords={handleDeleteSingleHistoryRecords}
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
            spendingLimitCredits={dailyBudgetLimitCredits}
            onSpendingLimitChange={handleDailyBudgetLimitChange}
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
            onUpdateVideoCreativeOptions={handleDeepDiveUpdateVideoCreativeOptions}
            onRunSelected={handleDeepDiveRunSelected}
            onRunSingle={handleDeepDiveRunSingle}
            historyRecords={deepDiveHistoryByProduct[deepDiveTarget.canonicalProductId] ?? []}
            onDeleteHistoryRecord={handleDeleteDeepDiveHistoryRecord}
            onBack={() => {
              setActiveView(deepDiveTarget.originView);
              window.scrollTo({ top: 0, behavior: getScrollBehavior() });
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
                  deepDiveTarget.originView === 'hunting' &&
                  liveResults.some((p) => p.id === deepDiveTarget.originalProductId)
                    ? liveResults
                    : [deepDiveTarget.product],
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
                <h1
                  className={`font-display text-xl sm:text-3xl font-bold text-zinc-950 dark:text-zinc-50 text-balance ${
                    language === 'my'
                      ? 'tracking-normal leading-[1.35]'
                      : 'tracking-tight leading-[1.18]'
                  }`}
                >
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

            {/* Unified Discovery Launcher (2-Tab Batch Discovery | Single Link Research + Auto-Collapse Summary Bar) */}
            <div ref={settingsSectionRef} className="scroll-mt-20">
              <DiscoveryLauncher
                language={language}
                activeTab={launcherTab}
                onTabChange={setLauncherTab}
                settingsExpanded={batchSettingsExpanded}
                onExpandSettingsChange={setBatchSettingsExpanded}
                hasResults={liveResults.length > 0}
                lastCostSummary={lastCostSummary}
                singleHistoryCount={singleProductHistory.length}
                settingsProps={{
                  selectedCategories,
                  onToggleCategory: handleToggleSettingsCategory,
                  onSelectAllVerifiedCategories: handleSelectAllVerifiedCategories,
                  onClearAllCategories: handleClearAllCategories,
                  syncedCategoryCache,
                  onSyncedCategoryCacheChange: handleSyncedCategoryCacheChange,
                  selectedSubcategoryIds,
                  onToggleSubcategory: handleToggleSubcategory,
                  onClearSubcategories: handleClearSubcategories,
                  onBalanceRefresh: () => setBalanceRefreshSignal((prev) => prev + 1),
                  bothCategoryMode,
                  onBothCategoryModeChange: setBothCategoryMode,
                  researchMode,
                  onResearchModeChange: setResearchMode,
                  deepDiveCount,
                  onDeepDiveCountChange: setDeepDiveCount,
                  includeReviewInsights,
                  onIncludeReviewInsightsChange: setIncludeReviewInsights,
                  strategyPreset,
                  salesWeightPct,
                  quantity,
                  onQuantityChange: setQuantity,
                  spendingLimitCredits: batchSpendingLimitCredits,
                  onSpendingLimitChange: handleBatchSpendingLimitChange,
                  myanmarLanguageOnly,
                  onMyanmarLanguageOnlyChange: setMyanmarLanguageOnly,
                  myanmarVideoScanPages,
                  onMyanmarVideoScanPagesChange: setMyanmarVideoScanPages,
                  lastCostSummary,
                  isHunting,
                  quotaStatus,
                  onPauseResearch: handlePauseResearch,
                  onResumeResearch: handleResumeResearch,
                  onConfirmStartHunting: () => handleStartHunting(false),
                  language,
                }}
                linkImportProps={{
                  language,
                  spendingLimitCredits: dailyBudgetLimitCredits,
                  serverBudgetCommittedCredits:
                    serverBudgetStatus.snapshot?.totalCommittedCredits ?? null,
                  onSpendingLimitChange: handleDailyBudgetLimitChange,
                  salesWeightPct,
                  syncedCategoryCache,
                  quotaStatus,
                  existingResultIds: liveResults.map((p) => getCanonicalProductId(p)),
                  existingSavedIds: savedRecords.map((r) => getCanonicalProductId(r.product)),
                  existingHistoryIds: researchHistory.flatMap((rec) =>
                    rec.products.map((p) => getCanonicalProductId(p))
                  ),
                  existingSingleHistoryIds: singleProductHistory.map((r) => r.canonicalProductId),
                  budgetStorageAvailable: serverBudgetStatus.storageAvailable,
                  serverBudgetRemainingCredits:
                    serverBudgetStatus.snapshot?.remainingCredits ?? null,
                  liveBalanceCredits: creditBalance.status?.balance ?? null,
                  activeSingleResult: activeSingleLinkResult,
                  singleHistoryCount: singleProductHistory.length,
                  isSavedProduct: isProductSavedByIdOrCanonical,
                  onFindExistingProduct: findWorkspaceProductByCanonicalId,
                  onOpenExistingAsSingleResult: handleOpenExistingAsSingleResult,
                  onClearActiveSingleResult: () => setActiveSingleLinkResult(null),
                  onOpenReport: handleOpenResultReport,
                  onOpenDeepDive: (targetProduct) =>
                    handleOpenDeepDive(
                      targetProduct,
                      'hunting',
                      activeSingleLinkResult?.researchedAt ?? targetProduct.researchedAt,
                      'fast'
                    ),
                  onToggleSave: handleToggleSaveProductDirect,
                  onViewSingleHistory: () => {
                    setHistoryInitialTab('single');
                    setActiveView('history');
                    window.scrollTo({ top: 0, behavior: getScrollBehavior() });
                  },
                  onProductImported: handleProductImportedFromLink,
                  onResumeResearch: handleResumeResearch,
                }}
              />
            </div>

            {/* Modular Memoized Research Results Section */}
            <HuntingResultsSection
              sectionRef={resultsSectionRef}
              language={language}
              liveResults={liveResults}
              liveEvaluations={liveEvaluations}
              isHunting={isHunting}
              researchedAt={researchedAt}
              sessionMeta={sessionMeta}
              lastCostSummary={lastCostSummary}
              researchSourceMode={researchSourceMode}
              groundingSources={groundingSources}
              searchQueries={searchQueries}
              activeHuntConfig={activeHuntConfig}
              quotaStatus={quotaStatus}
              displayErrorText={displayErrorText}
              salesWeightPct={salesWeightPct}
              deferredSalesWeightPct={deferredSalesWeightPct}
              strategyPreset={strategyPreset}
              onSelectStrategyPreset={handleSelectStrategyPreset}
              onCustomWeightChange={handleCustomWeightChange}
              savedIdSet={savedIdSet}
              rejectedIdSet={rejectedIdSet}
              comparedLiveProductIds={comparedLiveProductIds}
              filters={filters}
              onChangeFilters={setFilters}
              decisionFilter={decisionFilter}
              onChangeDecisionFilter={setDecisionFilter}
              sortField={sortField}
              onChangeSortField={setSortField}
              sortDirection={sortDirection}
              onToggleSortDirection={handleToggleSortDirection}
              onToggleSave={handleToggleSave}
              onToggleReject={handleToggleReject}
              onOpenReport={handleOpenResultReport}
              onOpenDeepDive={handleOpenLiveDeepDive}
              onToggleCompare={handleToggleCompareLiveProduct}
              onCancelHunting={handleCancelHunting}
              onResumeAndEditSettings={handleResumeAndEditSettings}
              onRetryHunt={handleFocusSettings}
              onTurnOffMyanmarAndEdit={handleTurnOffMyanmarAndEdit}
            />
          </>
        )}
      </main>

      {/* Compact Cross-View Comparison Tray Bar (fixed above MobileBottomNav on mobile, floating cleanly on desktop) */}
      {(() => {
        const showMobileBottomNav =
          activeView !== 'deep-dive' &&
          !activeReport &&
          !comparisonModalOpen &&
          !backupModalOpen;
        const showCompareTray =
          compareItems.length > 0 &&
          !comparisonModalOpen &&
          !activeReport &&
          activeView !== 'deep-dive';
        return (
          <>
            {showCompareTray && (
              <div
                className={`fixed inset-x-0 z-[35] pointer-events-none px-3.5 sm:px-6 lg:px-8 ${
                  showMobileBottomNav
                    ? 'bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-4'
                    : 'bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:bottom-4'
                }`}
              >
                <div className="max-w-[1280px] mx-auto">
                  <div className="pointer-events-auto bg-zinc-950/96 dark:bg-zinc-900/96 backdrop-blur-md border border-zinc-800 dark:border-zinc-700 text-white rounded-xl px-3.5 sm:px-4 py-2 shadow-lg flex items-center justify-between gap-2.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <GitCompareArrows className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                      <span className="font-medium truncate">
                        {t.compareBarTitle}:{' '}
                        <strong className="font-mono tabular-nums">{compareItems.length}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setCompareItems([])}
                        className="min-h-[40px] px-2.5 py-1.5 text-zinc-300 hover:text-white rounded-lg hover:bg-zinc-800/80 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {t.compareClearBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() => setComparisonModalOpen(true)}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 font-medium text-zinc-950 bg-white hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <span>
                          {t.compareOpenBtn} ({compareItems.length})
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quiet Minimal Footer (bottom clearance accounts for MobileBottomNav + active Compare Tray) */}
            <footer
              className={`border-t border-zinc-200/85 dark:border-zinc-800/85 bg-white dark:bg-zinc-900 ${
                showMobileBottomNav
                  ? showCompareTray
                    ? 'pb-[calc(8.5rem+env(safe-area-inset-bottom))] md:pb-20'
                    : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0'
                  : showCompareTray
                    ? 'pb-[calc(5rem+env(safe-area-inset-bottom))]'
                    : 'pb-[env(safe-area-inset-bottom)]'
              }`}
            >
              <div className="max-w-[1280px] mx-auto px-3.5 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                <span>{t.footerNote}</span>
                <span>{t.marketScope}</span>
              </div>
            </footer>

            {/* Mobile Fixed Bottom Tab Bar (below md — shown only on main pages, hidden while drawers/modals/Deep Dive are open) */}
            {showMobileBottomNav && (
              <MobileBottomNav
                activeView={activeView}
                shortlistCount={savedRecords.length}
                historyCount={researchHistory.length + singleProductHistory.length}
                onSelectDiscover={handleGoHome}
                onSelectHistory={() => {
                  setHistoryInitialTab('records');
                  setActiveView('history');
                  window.scrollTo({ top: 0, behavior: getScrollBehavior() });
                }}
                onSelectSaved={() => {
                  setActiveView('saved');
                  window.scrollTo({ top: 0, behavior: getScrollBehavior() });
                }}
                language={language}
              />
            )}
          </>
        );
      })()}

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
        spendingLimitCredits={dailyBudgetLimitCredits}
        serverBudgetCommittedCredits={
          serverBudgetStatus.snapshot?.totalCommittedCredits ?? null
        }
        serverBudgetRemainingCredits={
          serverBudgetStatus.snapshot?.remainingCredits ?? null
        }
        budgetStorageAvailable={serverBudgetStatus.storageAvailable}
        onSpendingLimitChange={handleDailyBudgetLimitChange}
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
        savedProductIds={savedIdSet}
        onSaveExternalProduct={(candidateProduct) =>
          handleSaveProductFromArchive(
            candidateProduct,
            candidateProduct.researchedAt ?? new Date().toISOString()
          )
        }
        onCreditsSpent={() => {
          setBalanceRefreshSignal((prev) => prev + 1);
          void refreshServerBudgetStatus();
        }}
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
