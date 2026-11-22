import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Database,
  HelpCircle,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCw,
  Scale,
  Trash2,
} from 'lucide-react';
import type {
  DataStatus,
  KalodataProductDetailEnrichmentRecord,
  KalodataReviewInsightData,
  KalodataShopEnrichmentRecord,
  Language,
  ProductEnrichmentExecutionSummary,
  ResearchProduct,
  ResearchQuotaStatus,
} from '../types/product';
import {
  buildImportedComparisonMatrix,
  planComparisonDetailEnrichment,
  type ComparisonCandidateItem,
} from '../utils/importedPhase3';
import { absorbProductsIntoEnrichmentCache, loadEnrichmentCache } from '../utils/enrichmentCache';
import { formatThb, resolveProductImageDisplayConfig } from '../utils/format';
import { formatCredits, formatUsd, KALODATA_PRODUCT_DETAIL_CREDIT } from '../utils/kalodataPricing';
import { getCanonicalProductId } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';

interface ImportedProductComparisonPanelProps {
  language: Language;
  salesWeightPct: number;
  selectedItems: ComparisonCandidateItem[];
  importedPool: ComparisonCandidateItem[];
  workspacePool: ComparisonCandidateItem[];
  spendingLimitCredits: number;
  serverBudgetRemainingCredits: number | null;
  liveBalanceCredits: number | null;
  budgetStorageAvailable: boolean;
  quotaStatus: ResearchQuotaStatus;
  onToggleCandidate: (item: ComparisonCandidateItem) => void;
  onClearSelection: () => void;
  onHydrateCachedProduct: (product: ResearchProduct) => void;
  onProductEnriched: (updatedProduct: ResearchProduct) => void;
  onBudgetChanged: () => void;
  onResumeResearch: () => Promise<void> | void;
}

function StatusGlyph({ status }: { status: DataStatus }) {
  if (status === 'verified') {
    return (
      <CheckCircle2
        className="w-3 h-3 text-emerald-700 dark:text-emerald-400 shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (status === 'estimated') {
    return (
      <AlertTriangle
        className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (status === 'unverified') {
    return (
      <HelpCircle
        className="w-3 h-3 text-zinc-500 dark:text-zinc-400 shrink-0"
        aria-hidden="true"
      />
    );
  }
  return (
    <AlertCircle
      className="w-3 h-3 text-zinc-400 dark:text-zinc-500 shrink-0"
      aria-hidden="true"
    />
  );
}

function getStatusTextClass(status: DataStatus): string {
  if (status === 'verified') return 'text-emerald-700 dark:text-emerald-400';
  if (status === 'estimated') return 'text-amber-700 dark:text-amber-400';
  if (status === 'unverified') return 'text-zinc-600 dark:text-zinc-400';
  return 'text-zinc-500 dark:text-zinc-400';
}

export function ImportedProductComparisonPanel({
  language,
  salesWeightPct,
  selectedItems,
  importedPool,
  workspacePool,
  spendingLimitCredits,
  serverBudgetRemainingCredits,
  liveBalanceCredits,
  budgetStorageAvailable,
  quotaStatus,
  onToggleCandidate,
  onClearSelection,
  onHydrateCachedProduct,
  onProductEnriched,
  onBudgetChanged,
  onResumeResearch,
}: ImportedProductComparisonPanelProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  const [addDropdownId, setAddDropdownId] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [userConfirmedPaid, setUserConfirmedPaid] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const matrix = useMemo(
    () => buildImportedComparisonMatrix(selectedItems),
    [selectedItems]
  );

  const enrichPlan = useMemo(
    () => planComparisonDetailEnrichment(selectedItems),
    [selectedItems]
  );

  const selectedIdSet = useMemo(
    () => new Set(selectedItems.map((i) => i.canonicalProductId)),
    [selectedItems]
  );

  const addableWorkspaceItems = useMemo(() => {
    const merged: ComparisonCandidateItem[] = [];
    const seen = new Set(selectedIdSet);
    for (const item of [...importedPool, ...workspacePool]) {
      if (!seen.has(item.canonicalProductId)) {
        seen.add(item.canonicalProductId);
        merged.push(item);
      }
    }
    return merged;
  }, [importedPool, workspacePool, selectedIdSet]);

  const effectiveRemainingBudget =
    serverBudgetRemainingCredits ?? spendingLimitCredits;
  const isLimitExceeded =
    enrichPlan.plannedApiCalls > 0 &&
    effectiveRemainingBudget + 1e-6 < enrichPlan.estimatedCredits;
  const isBalanceInsufficient =
    enrichPlan.plannedApiCalls > 0 &&
    liveBalanceCredits !== null &&
    liveBalanceCredits + 1e-6 < enrichPlan.estimatedCredits;

  const handleApplyCachedOnly = async () => {
    setEnrichError(null);
    const cache = loadEnrichmentCache();
    for (const col of matrix.columns) {
      if (!enrichPlan.cachedDetailIds.includes(col.canonicalProductId)) continue;
      const cachedPd = cache.products[col.canonicalProductId];
      if (!cachedPd) continue;
      try {
        const res = await fetch('/api/enrich-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product: col.product,
            requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
            spendingLimitCredits,
            userConfirmedPaidExecution: false,
            clientCachedProductDetail: cachedPd,
            salesWeightPct,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            product?: ResearchProduct;
          };
          if (data.product) {
            absorbProductsIntoEnrichmentCache([data.product]);
            onHydrateCachedProduct(data.product);
          }
        }
      } catch {
        // Fallback: local cache hydration happened cleanly
      }
    }
  };

  const handleConfirmPaidEnrichment = async () => {
    if (!userConfirmedPaid || isEnriching || enrichPlan.uncachedDetailIds.length === 0) return;
    if (quotaStatus.paused || !budgetStorageAvailable || isLimitExceeded || isBalanceInsufficient) {
      return;
    }

    setIsEnriching(true);
    setEnrichError(null);

    try {
      const cache = loadEnrichmentCache();
      const targetIds = new Set(enrichPlan.uncachedDetailIds);
      for (const col of matrix.columns) {
        if (!targetIds.has(col.canonicalProductId)) continue;
        const pid = col.canonicalProductId;
        const clientCachedPd: KalodataProductDetailEnrichmentRecord | null =
          cache.products[pid] ?? null;
        const shopId = col.product.kalodataMetrics?.sellerId?.trim() ?? null;
        const clientCachedShop: KalodataShopEnrichmentRecord | null =
          shopId && cache.shops[shopId] ? cache.shops[shopId] : null;
        const clientCachedReview: KalodataReviewInsightData | null =
          cache.reviews[pid] ?? null;

        const idempotencyKey = `cmp-enrich-${pid}-${Date.now()}`;
        const res = await fetch('/api/enrich-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product: col.product,
            requestedLayers: {
              productDetail: true,
              shopDetail: false,
              reviewInsights: false,
            },
            spendingLimitCredits,
            userConfirmedPaidExecution: true,
            idempotencyKey,
            clientCachedProductDetail: clientCachedPd,
            clientCachedShopDetail: clientCachedShop,
            clientCachedReviewInsight: clientCachedReview,
            salesWeightPct,
          }),
        });

        const payload = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              product?: ResearchProduct;
              execution?: ProductEnrichmentExecutionSummary;
              error?: string;
              errorMy?: string;
            }
          | null;

        if (!res.ok || !payload?.product) {
          setEnrichError(
            (isMy && payload?.errorMy ? payload.errorMy : payload?.error) ??
              `Enrichment failed (HTTP ${res.status})`
          );
          break;
        }

        absorbProductsIntoEnrichmentCache([payload.product]);
        onProductEnriched(payload.product);
      }
      onBudgetChanged();
      setConfirmOpen(false);
      setUserConfirmedPaid(false);
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : 'Unable to enrich comparison product details.');
    } finally {
      setIsEnriching(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Selector Row: Quick toggle Imported Pool + Add from Workspace */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {t.phase3ImportedPoolLabel}
            </span>
            <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
              · {matrix.columns.length} {t.phase3SelectedCountLabel}
            </span>
          </div>

          {selectedItems.length > 0 && (
            <button
              type="button"
              onClick={onClearSelection}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.phase3ClearSelectionBtn}</span>
            </button>
          )}
        </div>

        {/* Toggle Chips for Imported Products Library */}
        {importedPool.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {importedPool.slice(0, 9).map((entry) => {
              const isSelected = selectedIdSet.has(entry.canonicalProductId);
              const price = entry.product.priceThb;
              const comm = entry.product.commissionRate;
              return (
                <button
                  key={entry.canonicalProductId}
                  type="button"
                  onClick={() => onToggleCandidate(entry)}
                  aria-pressed={isSelected}
                  className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer flex items-center gap-2.5 min-w-0 ${
                    isSelected
                      ? 'bg-zinc-950/5 dark:bg-zinc-100/10 border-zinc-950 dark:border-zinc-200'
                      : 'bg-zinc-50/70 dark:bg-zinc-950/40 border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                      isSelected
                        ? 'bg-zinc-950 dark:bg-zinc-100 border-zinc-950 dark:border-zinc-100 text-white dark:text-zinc-950'
                        : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" aria-hidden="true" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-zinc-950 dark:text-zinc-50 truncate">
                      {isMy ? entry.product.nameMy : entry.product.name}
                    </div>
                    <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums truncate">
                      #{entry.canonicalProductId}
                      {typeof price === 'number' && price > 0 ? ` · ${formatThb(price)}` : ''}
                      {typeof comm === 'number' && comm > 0 ? ` · ${comm}%` : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Picker to add another product from Workspace Pool or Imported Pool */}
        {addableWorkspaceItems.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label
              htmlFor="phase3-add-compare-select"
              className="text-xs text-zinc-600 dark:text-zinc-400 shrink-0"
            >
              {t.phase3AddFromWorkspaceLabel}:
            </label>
            <div className="flex items-center gap-2 flex-1 min-w-0 max-w-md">
              <select
                id="phase3-add-compare-select"
                value={addDropdownId}
                onChange={(e) => {
                  const chosenId = e.target.value;
                  setAddDropdownId('');
                  if (!chosenId) return;
                  const target = addableWorkspaceItems.find(
                    (i) => i.canonicalProductId === chosenId
                  );
                  if (target) onToggleCandidate(target);
                }}
                className="w-full min-h-[36px] px-3 py-1.5 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-950/15 dark:focus:ring-zinc-100/20"
              >
                <option value="">{t.phase3AddFromWorkspacePlaceholder}</option>
                {addableWorkspaceItems.map((item) => (
                  <option key={item.canonicalProductId} value={item.canonicalProductId}>
                    {isMy ? item.product.nameMy : item.product.name} (#{item.canonicalProductId})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Minimum 2 Products Notice */}
      {!matrix.canCompare && (
        <div
          role="status"
          className="p-4 bg-zinc-50/70 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-start gap-3"
        >
          <Scale className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1 text-xs">
            <div className="font-semibold text-zinc-950 dark:text-zinc-50">
              {t.phase3SelectAtLeastTwoTitle}
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {t.phase3SelectAtLeastTwoDesc}
            </p>
          </div>
        </div>
      )}

      {/* Missing Product Detail Cost Preview & Confirmation Gate (when >=2 products compared & detail missing) */}
      {matrix.canCompare && enrichPlan.missingDetailIds.length > 0 && (
        <div className="p-4 bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-zinc-950 dark:text-zinc-50">
                <Database className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400 shrink-0" aria-hidden="true" />
                <span>{t.phase3MissingDetailTitle}</span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {enrichPlan.cachedDetailIds.length > 0 && enrichPlan.uncachedDetailIds.length === 0
                  ? t.phase3MissingDetailCachedDesc
                  : t.phase3MissingDetailPaidDesc}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {enrichPlan.cachedDetailIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleApplyCachedOnly()}
                  className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {t.phase3ApplyCachedDetailBtn} ({enrichPlan.cachedDetailIds.length})
                  </span>
                </button>
              )}

              {enrichPlan.uncachedDetailIds.length > 0 && !confirmOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmOpen(true);
                    setUserConfirmedPaid(false);
                    setEnrichError(null);
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {t.phase3EnrichMissingBtn} ({formatCredits(enrichPlan.estimatedCredits)} cr)
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Explicit Confirmation Box for Missing Detail Calls */}
          {confirmOpen && enrichPlan.uncachedDetailIds.length > 0 && (
            <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.phase3EnrichConfirmTitle}
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">
                    {enrichPlan.plannedApiCalls} × Product Detail ({formatCredits(KALODATA_PRODUCT_DETAIL_CREDIT)} cr) ={' '}
                    <strong className="font-mono text-zinc-950 dark:text-zinc-50 tabular-nums">
                      {formatCredits(enrichPlan.estimatedCredits)} {t.creditsUnit}
                    </strong>{' '}
                    (≈ {formatUsd(enrichPlan.estimatedUsd)})
                  </p>
                </div>
                <div className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300 tabular-nums sm:text-right">
                  <div>
                    {t.linkImportBudgetRemainingLabel}:{' '}
                    <strong>{formatCredits(effectiveRemainingBudget)} cr</strong>
                  </div>
                  {liveBalanceCredits !== null && (
                    <div>
                      {t.linkImportBalanceLabel}: <strong>{formatCredits(liveBalanceCredits)} cr</strong>
                    </div>
                  )}
                </div>
              </div>

              {quotaStatus.paused && (
                <div className="p-2.5 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-lg flex flex-wrap items-center justify-between gap-2 text-amber-950 dark:text-amber-100">
                  <span>{t.linkImportPausedBannerTitle}</span>
                  <button
                    type="button"
                    onClick={() => void onResumeResearch()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-md cursor-pointer"
                  >
                    <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.btnResumeAndRetry}</span>
                  </button>
                </div>
              )}

              {!budgetStorageAvailable && (
                <p className="text-red-700 dark:text-red-400">{t.linkImportStorageBlockedNote}</p>
              )}

              {isLimitExceeded && (
                <p className="text-red-700 dark:text-red-400">{t.enrichSpendingLimitBlocked}</p>
              )}

              {isBalanceInsufficient && (
                <p className="text-red-700 dark:text-red-400">
                  {isMy
                    ? `Kalodata လက်ကျန် Credit မလုံလောက်ပါ (${formatCredits(liveBalanceCredits ?? 0)} cr)။`
                    : `Insufficient Kalodata balance (${formatCredits(liveBalanceCredits ?? 0)} cr available).`}
                </p>
              )}

              {enrichError && (
                <p className="text-red-700 dark:text-red-400">{enrichError}</p>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <label className="inline-flex items-center gap-2 text-zinc-800 dark:text-zinc-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={userConfirmedPaid}
                    onChange={(e) => setUserConfirmedPaid(e.target.checked)}
                    disabled={
                      quotaStatus.paused ||
                      !budgetStorageAvailable ||
                      isLimitExceeded ||
                      isBalanceInsufficient ||
                      isEnriching
                    }
                    className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 text-zinc-950 cursor-pointer"
                  />
                  <span>{t.phase3EnrichConfirmCheckbox}</span>
                </label>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isEnriching}
                    onClick={() => {
                      setConfirmOpen(false);
                      setUserConfirmedPaid(false);
                    }}
                    className="min-h-[34px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg cursor-pointer"
                  >
                    {t.phase3EnrichCancelBtn}
                  </button>
                  <button
                    type="button"
                    disabled={
                      !userConfirmedPaid ||
                      quotaStatus.paused ||
                      !budgetStorageAvailable ||
                      isLimitExceeded ||
                      isBalanceInsufficient ||
                      isEnriching
                    }
                    onClick={() => void handleConfirmPaidEnrichment()}
                    className="inline-flex items-center gap-1.5 min-h-[34px] px-3.5 py-1.5 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-lg disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                  >
                    {isEnriching ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        <span>{t.phase3EnrichingLabel}</span>
                      </>
                    ) : (
                      <span>{t.phase3EnrichConfirmProceedBtn}</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Side-by-Side Comparison Matrix Table */}
      {matrix.columns.length > 0 && (
        <div className="overflow-x-auto border border-zinc-200/90 dark:border-zinc-800 rounded-xl">
          <table className="w-full min-w-[640px] text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/80 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-3 px-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 w-48 align-top">
                  Metric
                </th>
                {matrix.columns.map((col) => {
                  const imgCfg = resolveProductImageDisplayConfig(col.product);
                  const displayName = isMy ? col.product.nameMy : col.product.name;
                  return (
                    <th
                      key={col.canonicalProductId}
                      className="py-3 px-4 align-top min-w-[200px] border-l border-zinc-100 dark:border-zinc-800/80"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 shrink-0">
                            {imgCfg.canRender && imgCfg.src ? (
                              <ProductImage
                                src={imgCfg.src}
                                fallbackSrc={imgCfg.fallbackSrc}
                                productId={getCanonicalProductId(col.product)}
                                alt={col.product.name}
                                title={displayName}
                                unavailableLabel={t.cardImageUnverified}
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-50 line-clamp-2 leading-snug">
                              {displayName}
                            </div>
                            <div className="font-mono text-[11px] font-normal text-zinc-500 dark:text-zinc-400 tabular-nums mt-0.5 truncate">
                              #{col.canonicalProductId}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onToggleCandidate(col)}
                          aria-label={`${t.phase3RemoveColBtn} ${displayName}`}
                          className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 px-1.5 py-0.5 rounded hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer shrink-0"
                        >
                          {t.phase3RemoveColBtn}
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80 text-xs">
              {matrix.rows.map((row) => (
                <tr key={row.key} className="bg-white dark:bg-zinc-900">
                  <th
                    scope="row"
                    className="py-3 px-4 font-medium text-zinc-700 dark:text-zinc-300 align-top"
                  >
                    <div className="space-y-0.5">
                      <div>{isMy ? row.labelMy : row.labelEn}</div>
                      {row.hasDifference && (
                        <div className="text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                          {t.phase3DiffMarker}
                        </div>
                      )}
                    </div>
                  </th>

                  {row.cells.map((cell) => (
                    <td
                      key={`${row.key}-${cell.canonicalProductId}`}
                      className={`py-3 px-4 align-top border-l border-zinc-100 dark:border-zinc-800/80 ${
                        cell.isBest
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                          : ''
                      }`}
                    >
                      <div className="space-y-1">
                        <div
                          className={`font-mono font-semibold tabular-nums ${
                            cell.status === 'unavailable'
                              ? 'text-zinc-400 dark:text-zinc-500 font-normal'
                              : cell.isBest
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-zinc-950 dark:text-zinc-50'
                          }`}
                        >
                          {isMy ? cell.valueMy : cell.valueEn}
                        </div>

                        {(isMy ? cell.subValueMy : cell.subValueEn) && (
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug font-mono tabular-nums">
                            {isMy ? cell.subValueMy : cell.subValueEn}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5 text-[11px]">
                          <span
                            className={`inline-flex items-center gap-1 font-medium ${getStatusTextClass(
                              cell.status
                            )}`}
                          >
                            <StatusGlyph status={cell.status} />
                            <span>{t.dataStatusLabels[cell.status]}</span>
                          </span>
                          {cell.isBest && (
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                              · {t.phase3BestMarker}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
