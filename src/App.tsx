import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  Loader2,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  SearchCheck,
} from 'lucide-react';
import {
  AppView,
  CategoryFilter,
  ConfidenceLevel,
  DecisionFilter,
  GroundingSourceLink,
  Language,
  ProductDecision,
  ResearchConfig,
  ResearchProduct,
  ResearchQuantity,
  ResearchQuotaStatus,
  ResearchSessionResponse,
  ResultSortKey,
  SavedProductRecord,
  StrategyPreset,
} from './types/product';
import { evaluateProductOpportunity } from './utils/scoring';
import {
  createSavedRecord,
  formatResearchDate,
  loadSavedProducts,
  persistSavedProducts,
} from './utils/savedProductsStorage';
import { TRANSLATIONS } from './i18n/translations';
import { Header } from './components/Header';
import { ResearchSettingsPanel } from './components/ResearchSettingsPanel';
import { ScoringRubricPanel } from './components/ScoringRubricPanel';
import { ResearchResultCard } from './components/ResearchResultCard';
import { ResearchReportDrawer } from './components/ResearchReportDrawer';
import { SavedProductsView } from './components/SavedProductsView';
import { KalodataBalanceBar } from './components/KalodataBalanceBar';

const STRATEGY_WEIGHTS: Record<StrategyPreset, number> = {
  balanced: 50,
  'sales-first': 70,
  'commission-first': 30,
};

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

interface ActiveReportState {
  product: ResearchProduct;
  researchDate: string | null;
}

interface SessionMeta {
  requestedQuantity: ResearchQuantity;
  verifiedProductCount: number;
  filteredOutCount: number;
}

interface HuntErrorState {
  messageEn: string;
  messageMy?: string;
  code?: string;
}

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [activeView, setActiveView] = useState<AppView>('hunting');

  // Research Settings State
  const [settingsCategory, setSettingsCategory] = useState<CategoryFilter>('all');
  const [strategyPreset, setStrategyPreset] = useState<StrategyPreset>('balanced');
  const [salesWeightPct, setSalesWeightPct] = useState<number>(50);
  const [showFineTune, setShowFineTune] = useState(false);
  const [quantity, setQuantity] = useState<ResearchQuantity>(10);

  // Live Grounded Research State
  const [liveResults, setLiveResults] = useState<ResearchProduct[]>([]);
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(null);
  const [researchSourceMode, setResearchSourceMode] = useState<
    'google-search-grounding' | 'live-official-storefronts' | null
  >(null);
  const [researchedAt, setResearchedAt] = useState<string | null>(null);
  const [groundingSources, setGroundingSources] = useState<GroundingSourceLink[]>([]);
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [groundingOpen, setGroundingOpen] = useState(false);
  const [isHunting, setIsHunting] = useState(false);
  const [huntError, setHuntError] = useState<HuntErrorState | null>(null);
  const [activeHuntConfig, setActiveHuntConfig] = useState<ResearchConfig | null>(null);

  // Quota Pause / Resume State (Hydrated from server on mount)
  const [quotaStatus, setQuotaStatus] = useState<ResearchQuotaStatus>({
    paused: false,
    reason: null,
    pausedAt: null,
  });

  // Persisted Saved Products (hydrated from localStorage on load, includes Research Date & Sources)
  const [savedRecords, setSavedRecords] = useState<SavedProductRecord[]>(() =>
    loadSavedProducts()
  );

  // Session Rejected IDs
  const [rejectedIds, setRejectedIds] = useState<string[]>([]);

  // Results Interface Filter & Sort State
  const [resultsCategory, setResultsCategory] = useState<CategoryFilter>('all');
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('active');
  const [sortKey, setSortKey] = useState<ResultSortKey>('score-desc');

  // Report Drawer & Scoring Guide
  const [activeReport, setActiveReport] = useState<ActiveReportState | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);

  const settingsSectionRef = useRef<HTMLDivElement>(null);
  const resultsSectionRef = useRef<HTMLElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persist Saved Products to localStorage whenever updated
  useEffect(() => {
    persistSavedProducts(savedRecords);
  }, [savedRecords]);

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

  const handleDeleteSaved = (id: string) => {
    setSavedRecords((prev) => prev.filter((r) => r.id !== id));
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
    setResultsCategory(cat);
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

  const handleStartHunting = async (forceResumeOverride?: boolean) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const shouldForceResume = forceResumeOverride === true || quotaStatus.paused;

    const payload: ResearchConfig & { forceResume?: boolean } = {
      market: 'Thailand TikTok Shop',
      category: settingsCategory,
      priceLimit: 'unrestricted',
      strategyPreset,
      salesWeightPct,
      quantity,
      forceResume: shouldForceResume,
    };

    setActiveView('hunting');
    setActiveHuntConfig(payload);
    setHuntError(null);
    setIsHunting(true);
    setDecisionFilter('active');
    setResultsCategory(payload.category);

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
            reason:
              data.code === 'SEARCH_QUOTA_EXHAUSTED' ? 'search-quota-exhausted' : 'manual',
            pausedAt: new Date().toISOString(),
          });
        }

        // When quota is paused, the dedicated Quota Paused banner handles messaging cleanly
        const isQuotaPauseError =
          data &&
          'code' in data &&
          (data.code === 'SEARCH_QUOTA_EXHAUSTED' || data.code === 'RESEARCH_PAUSED');

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
      setLiveResults(data.products);
      setSessionMeta({
        requestedQuantity: data.requestedQuantity ?? payload.quantity,
        verifiedProductCount: data.verifiedProductCount ?? data.products.length,
        filteredOutCount: data.filteredOutCount ?? 0,
      });
      setResearchSourceMode(data.researchSourceMode ?? 'google-search-grounding');
      setResearchedAt(data.researchedAt ?? new Date().toISOString());
      setGroundingSources(Array.isArray(data.groundingSources) ? data.groundingSources : []);
      setSearchQueries(Array.isArray(data.searchQueries) ? data.searchQueries : []);
      setRejectedIds([]);
      setGroundingOpen(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Unable to complete product research.';
      setHuntError({ messageEn: message });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsHunting(false);
      }
    }
  };

  const handleOpenResultReport = (product: ResearchProduct) => {
    const existingSaved = savedRecords.find((r) => r.id === product.id);
    setActiveReport({
      product,
      researchDate: existingSaved?.researchDate ?? product.researchedAt ?? researchedAt,
    });
  };

  const handleOpenSavedReport = (record: SavedProductRecord) => {
    setActiveReport({
      product: record.product,
      researchDate: record.researchDate,
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

  // Filtered and Score-sorted results
  const visibleProducts = useMemo<ResearchProduct[]>(() => {
    const filtered = liveResults.filter((product) => {
      if (resultsCategory !== 'all' && product.category !== resultsCategory) {
        return false;
      }
      if (decisionFilter === 'active') return !rejectedIdSet.has(product.id);
      if (decisionFilter === 'saved') return savedIdSet.has(product.id);
      if (decisionFilter === 'rejected') return rejectedIdSet.has(product.id);
      return true;
    });

    return [...filtered].sort((a, b) => {
      const evalA = evaluateProductOpportunity(a);
      const evalB = evaluateProductOpportunity(b);
      switch (sortKey) {
        case 'score-desc':
          return evalB.totalScore - evalA.totalScore;
        case 'score-asc':
          return evalA.totalScore - evalB.totalScore;
        case 'confidence-desc':
          return (
            CONFIDENCE_RANK[evalB.confidenceLevel] - CONFIDENCE_RANK[evalA.confidenceLevel] ||
            evalB.totalScore - evalA.totalScore
          );
        case 'price-asc': {
          const pA = a.priceThb ?? Number.POSITIVE_INFINITY;
          const pB = b.priceThb ?? Number.POSITIVE_INFINITY;
          return pA - pB;
        }
        case 'price-desc': {
          const pA = a.priceThb ?? -1;
          const pB = b.priceThb ?? -1;
          return pB - pA;
        }
        default:
          return 0;
      }
    });
  }, [liveResults, resultsCategory, decisionFilter, savedIdSet, rejectedIdSet, sortKey]);

  const activeCategoryLabel = activeHuntConfig
    ? activeHuntConfig.category === 'all'
      ? t.settingBothCategories
      : activeHuntConfig.category === 'womens-fashion'
        ? t.categoryFashion
        : t.categoryBeauty
    : '';

  const displayErrorText = huntError
    ? language === 'my' && huntError.messageMy
      ? huntError.messageMy
      : huntError.messageEn
    : null;

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#FAFAFA] text-zinc-950">
      <Header
        activeView={activeView}
        activeCategory={resultsCategory}
        onGoHome={handleGoHome}
        onSelectCategory={handleHeaderCategorySelect}
        onFocusStrategy={handleFocusSettings}
        shortlistCount={savedRecords.length}
        onToggleSavedView={() => {
          setActiveView((prev) => (prev === 'saved' ? 'hunting' : 'saved'));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        language={language}
      />

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-16 sm:pb-24">
        {/* Top Utility Strip: Market Context + Quiet Language Switch */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <p className="text-xs font-medium text-zinc-500">
            Thailand · TikTok Shop Affiliate · THB (฿)
          </p>

          <div
            className="inline-flex items-center p-0.5 bg-zinc-200/70 rounded-lg"
            role="group"
            aria-label="Language"
          >
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                language === 'en'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage('my')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                language === 'my'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              မြန်မာ
            </button>
          </div>
        </div>

        {activeView === 'saved' ? (
          /* Dedicated Persistent Saved Products View */
          <SavedProductsView
            records={savedRecords}
            onDelete={handleDeleteSaved}
            onOpenReport={handleOpenSavedReport}
            onBackToHunting={handleGoHome}
            language={language}
          />
        ) : (
          <>
            {/* Focused Editorial Header */}
            <section className="max-w-3xl">
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950 leading-[1.15] text-balance">
                {t.heroTitle}
              </h1>
              <p className="mt-3 text-sm sm:text-base text-zinc-600 leading-relaxed max-w-2xl">
                {t.heroSubtitle}
              </p>
            </section>

            {/* Product Research Settings Panel */}
            <div ref={settingsSectionRef} className="scroll-mt-20">
              <ResearchSettingsPanel
                category={settingsCategory}
                onCategoryChange={setSettingsCategory}
                strategyPreset={strategyPreset}
                salesWeightPct={salesWeightPct}
                onSelectStrategyPreset={handleSelectStrategyPreset}
                onCustomWeightChange={handleCustomWeightChange}
                showFineTune={showFineTune}
                onToggleFineTune={() => setShowFineTune((prev) => !prev)}
                quantity={quantity}
                onQuantityChange={setQuantity}
                isHunting={isHunting}
                quotaStatus={quotaStatus}
                onPauseResearch={handlePauseResearch}
                onResumeResearch={handleResumeResearch}
                onStartHunting={() => handleStartHunting(false)}
                language={language}
              />
            </div>

            {/* Kalodata Open Center Free Credit Balance Check */}
            <KalodataBalanceBar language={language} />

            {/* Research Results Interface */}
            <section
              id="catalog-section"
              ref={resultsSectionRef}
              aria-labelledby="results-section-heading"
              className="mt-12 scroll-mt-20"
            >
              {/* Section Title + Session Timestamp */}
              <div className="flex flex-wrap items-baseline justify-between gap-4 pb-4 border-b border-zinc-200">
                <div className="flex items-baseline gap-2.5">
                  <h2
                    id="results-section-heading"
                    className="font-display text-xl font-bold tracking-tight text-zinc-950"
                  >
                    {t.resultsSectionHeading}
                  </h2>
                  <span className="font-mono text-xs text-zinc-500 tabular-nums">
                    ({visibleProducts.length})
                  </span>
                </div>

                {researchedAt && !isHunting && (
                  <span className="font-mono text-xs text-zinc-500 tabular-nums">
                    {t.savedResearchDateLabel}: {formatResearchDate(researchedAt, language)}
                  </span>
                )}
              </div>

              {/* Transparent Opportunity Scoring System Guide & Official Independence Disclaimer */}
              <ScoringRubricPanel
                isOpen={rubricOpen}
                onToggle={() => setRubricOpen((prev) => !prev)}
                language={language}
              />

              {/* Honest Live Research Paused Banner (Google Search Quota Exhausted or Manual Pause) */}
              {!isHunting && quotaStatus.paused && (
                <div
                  role="status"
                  className="mt-4 p-5 bg-white border border-amber-300/90 rounded-xl flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <PauseCircle
                      className="w-5 h-5 text-amber-700 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="space-y-1.5 text-xs sm:text-sm">
                      <h3 className="font-semibold text-zinc-950">
                        {quotaStatus.reason === 'search-quota-exhausted'
                          ? t.quotaPausedTitle
                          : t.manualPausedTitle}
                      </h3>
                      <p className="text-zinc-600 leading-relaxed">
                        {quotaStatus.reason === 'search-quota-exhausted'
                          ? t.quotaPausedDesc
                          : t.manualPausedDesc}
                      </p>
                      {quotaStatus.reason === 'search-quota-exhausted' && (
                        <p className="text-xs text-zinc-500 leading-relaxed">
                          {t.quotaResetUnknownNote}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-start">
                    <button
                      type="button"
                      onClick={() => handleStartHunting(true)}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-zinc-950 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <PlayCircle className="w-4 h-4" aria-hidden="true" />
                      <span>{t.btnResumeAndRetry}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Live Google Search Grounding Sources Summary & Quality-Over-Quantity Readout */}
              {!isHunting && liveResults.length > 0 && groundingSources.length > 0 && (
                <div className="mt-4 bg-white border border-zinc-200/90 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setGroundingOpen((prev) => !prev)}
                    aria-expanded={groundingOpen}
                    className="w-full px-4 sm:px-5 py-3 flex items-center justify-between gap-4 text-left hover:bg-zinc-50/80 transition-colors cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs min-w-0">
                      <Globe className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                      <span className="font-semibold text-zinc-900 whitespace-nowrap">
                        {researchSourceMode === 'live-official-storefronts'
                          ? t.liveStorefrontBarLabel
                          : t.groundingBarLabel}
                      </span>
                      <span className="text-zinc-400" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono text-zinc-600 tabular-nums">
                        {groundingSources.length} {t.groundingSourcesCount}
                      </span>
                      {sessionMeta && (
                        <>
                          <span className="text-zinc-400" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono text-zinc-700 tabular-nums">
                            {sessionMeta.verifiedProductCount}/{sessionMeta.requestedQuantity}{' '}
                            {t.qualityGateVerifiedLabel}
                          </span>
                        </>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 shrink-0 whitespace-nowrap">
                      <span>{groundingOpen ? t.groundingToggleHide : t.groundingToggleShow}</span>
                      {groundingOpen ? (
                        <ChevronUp className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-4 h-4" aria-hidden="true" />
                      )}
                    </span>
                  </button>

                  {researchSourceMode === 'live-official-storefronts' && (
                    <div className="px-4 sm:px-5 py-2.5 bg-zinc-50/80 border-t border-zinc-100 text-xs text-zinc-600">
                      {t.liveStorefrontNote}
                    </div>
                  )}

                  {sessionMeta &&
                    sessionMeta.verifiedProductCount < sessionMeta.requestedQuantity && (
                      <div className="px-4 sm:px-5 py-2.5 bg-zinc-50/80 border-t border-zinc-100 text-xs text-zinc-600">
                        {t.qualityGateExcludedNote}
                      </div>
                    )}

                  {groundingOpen && (
                    <div className="px-4 sm:px-5 pb-4 pt-3 border-t border-zinc-100 space-y-3">
                      {searchQueries.length > 0 && (
                        <div className="text-xs text-zinc-500">
                          <span className="font-medium text-zinc-700 mr-1.5">
                            {t.groundingQueriesLabel}:
                          </span>
                          <span>{searchQueries.join(' · ')}</span>
                        </div>
                      )}
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                        {groundingSources.map((src, idx) => (
                          <li
                            key={`${idx}-${src.url}`}
                            className="flex items-center justify-between gap-2 py-1 border-b border-zinc-100 text-xs"
                          >
                            <span className="text-zinc-700 truncate">
                              {src.title}{' '}
                              <span className="text-zinc-400">({src.domain})</span>
                            </span>
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline whitespace-nowrap shrink-0"
                            >
                              <span>{t.sourceOpenLink}</span>
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Results Controls Bar: Category Filter + Decision Tabs + Score Sort */}
              <div className="mt-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className="inline-flex items-center p-1 bg-zinc-200/70 rounded-lg overflow-x-auto"
                    role="group"
                    aria-label={t.settingCategoryLabel}
                  >
                    {(
                      [
                        { id: 'all', label: t.categoryAll },
                        { id: 'womens-fashion', label: t.categoryFashion },
                        { id: 'cosmetics-beauty', label: t.categoryBeauty },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setResultsCategory(tab.id)}
                        className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          resultsCategory === tab.id
                            ? 'bg-white text-zinc-950 shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-950'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Active / Saved / Rejected Queue Switch */}
                  <div
                    className="inline-flex items-center gap-4 text-xs font-medium pl-1"
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
                        onClick={() => setDecisionFilter(q.id)}
                        className={`py-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
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

                {/* Score & Metric Sort Select */}
                <div className="flex items-center gap-2.5 self-start lg:self-auto">
                  <label htmlFor="results-sort" className="text-xs font-medium text-zinc-500">
                    {t.sortLabel}
                  </label>
                  <select
                    id="results-sort"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as ResultSortKey)}
                    className="min-h-[38px] px-3 py-1.5 text-xs sm:text-sm font-medium bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
                  >
                    <option value="score-desc">{t.sortScoreDesc}</option>
                    <option value="score-asc">{t.sortScoreAsc}</option>
                    <option value="confidence-desc">{t.sortConfidenceDesc}</option>
                    <option value="price-asc">{t.sortPriceAsc}</option>
                    <option value="price-desc">{t.sortPriceDesc}</option>
                  </select>
                </div>
              </div>

              {/* Error State (Propagated honestly from server — never replaced with fake results) */}
              {displayErrorText && !isHunting && (
                <div
                  role="alert"
                  className="mt-6 bg-white border border-red-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-950">
                        {t.huntingErrorTitle}
                      </h3>
                      <p className="mt-1 text-xs sm:text-sm text-zinc-600 leading-relaxed">
                        {displayErrorText}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartHunting(false)}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-zinc-950 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.huntingRetryBtn}</span>
                  </button>
                </div>
              )}

              {/* Results Body: Loading vs Empty Ready State vs Filtered Empty vs Live Card Grid */}
              <div className="mt-6">
                {isHunting ? (
                  <div className="bg-white border border-zinc-200/90 rounded-xl px-6 py-16 text-center">
                    <div className="w-11 h-11 rounded-xl bg-zinc-100 text-zinc-900 inline-flex items-center justify-center mb-4">
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                    </div>
                    <h3 className="font-display text-base sm:text-lg font-semibold text-zinc-950">
                      {t.huntingLoadingTitle}
                    </h3>
                    <p className="mt-2 text-sm text-zinc-500 max-w-lg mx-auto leading-relaxed">
                      {t.huntingLoadingDesc}
                    </p>
                    {activeHuntConfig && (
                      <div className="mt-5 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 rounded-lg bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-700">
                        <span className="font-medium text-zinc-950">
                          {activeHuntConfig.market}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{activeCategoryLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums font-medium text-zinc-950">
                          {activeHuntConfig.quantity} {t.quantityProductsUnit}
                        </span>
                      </div>
                    )}
                    <div className="mt-6">
                      <button
                        type="button"
                        onClick={handleCancelHunting}
                        className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-2 text-xs font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:text-zinc-950 hover:border-zinc-400 transition-colors cursor-pointer"
                      >
                        {t.huntingCancelBtn}
                      </button>
                    </div>
                  </div>
                ) : liveResults.length === 0 ? (
                  <div className="bg-white border border-zinc-200/90 rounded-xl px-6 py-14 sm:py-16 text-center">
                    <div className="w-11 h-11 rounded-xl bg-zinc-100 text-zinc-600 inline-flex items-center justify-center mb-4">
                      <SearchCheck className="w-5 h-5" aria-hidden="true" />
                    </div>

                    <h3 className="font-display text-base sm:text-lg font-semibold text-zinc-950">
                      {t.emptyLiveTitle}
                    </h3>
                    <p className="mt-2 text-sm text-zinc-500 max-w-lg mx-auto leading-relaxed">
                      {t.emptyLiveDesc}
                    </p>

                    <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleStartHunting(false)}
                        className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 text-xs sm:text-sm font-medium text-white bg-zinc-950 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <span>
                          {quotaStatus.paused ? t.btnResumeAndRetry : t.emptyStartBtn}
                        </span>
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </button>

                      {savedRecords.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveView('saved');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 text-xs sm:text-sm font-medium text-zinc-900 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer"
                        >
                          <span>
                            {t.savedViewTitle} ({savedRecords.length})
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : visibleProducts.length === 0 ? (
                  <div className="bg-white border border-zinc-200/90 rounded-xl px-6 py-14 text-center">
                    <h3 className="font-display text-base font-semibold text-zinc-950">
                      {t.emptyFilteredTitle}
                    </h3>
                    <p className="mt-2 text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
                      {t.emptyFilteredDesc}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setResultsCategory('all');
                        setDecisionFilter('active');
                      }}
                      className="mt-5 inline-flex items-center gap-2 min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-zinc-950 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
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
                        decision={getDecision(product.id)}
                        onSave={handleToggleSave}
                        onReject={handleToggleReject}
                        onOpenReport={handleOpenResultReport}
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

      {/* Quiet Minimal Footer */}
      <footer className="border-t border-zinc-200/80 bg-white">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-500">
          <span>{t.footerNote}</span>
          <span>{t.marketScope}</span>
        </div>
      </footer>

      {/* Detailed Research Report Drawer (Works from both Hunting Results and Saved Products) */}
      <ResearchReportDrawer
        product={activeReport?.product ?? null}
        researchDate={activeReport?.researchDate ?? null}
        decision={activeReport ? getDecision(activeReport.product.id) : 'pending'}
        onSave={handleToggleSave}
        onReject={handleToggleReject}
        onClose={() => setActiveReport(null)}
        language={language}
      />
    </div>
  );
}
