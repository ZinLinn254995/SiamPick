import { useMemo, useState } from 'react';
import { GitCompareArrows, Search, Sparkles } from 'lucide-react';
import type {
  Language,
  ResearchProduct,
  ResearchQuotaStatus,
  SyncedKalodataCategoryCache,
} from '../types/product';
import type { SimilarProductSearchResponse } from '../types/importedPhase3';
import type { ImportedWorkspaceContext } from '../utils/importedProductWorkspace';
import {
  contextToLibraryEntry,
  type ComparisonCandidateItem,
  type ImportedLibraryEntry,
} from '../utils/importedPhase3';
import { getCanonicalProductId } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';
import { ImportedProductComparisonPanel } from './ImportedProductComparisonPanel';
import { SimilarProductFinderPanel } from './SimilarProductFinderPanel';

type Phase3ActiveTab = 'comparison' | 'similar';

interface ImportedPhase3WorkspaceProps {
  language: Language;
  activeContext: ImportedWorkspaceContext;
  importedLibrary: readonly ImportedLibraryEntry[];
  selectedCompareItems: ComparisonCandidateItem[];
  liveResults: readonly ResearchProduct[];
  savedProducts: readonly ResearchProduct[];
  historyProducts: readonly ResearchProduct[];
  salesWeightPct: number;
  spendingLimitCredits: number;
  syncedCategoryCache: SyncedKalodataCategoryCache;
  serverBudgetRemainingCredits: number | null;
  liveBalanceCredits: number | null;
  budgetStorageAvailable: boolean;
  quotaStatus: ResearchQuotaStatus;
  onSelectImportedEntry: (entry: ImportedLibraryEntry) => void;
  onToggleCompareItem: (item: ComparisonCandidateItem) => void;
  onClearCompareSelection: () => void;
  onAddSimilarToCompare: (
    product: ResearchProduct,
    origin: 'kalodata-similar-search' | 'workspace-pool'
  ) => void;
  onOpenProductFromSimilar: (product: ResearchProduct) => void;
  onHydrateOrEnrichProduct: (updatedProduct: ResearchProduct) => void;
  onBudgetChanged: () => void;
  onResumeResearch: () => Promise<void> | void;
}

export function ImportedPhase3Workspace({
  language,
  activeContext,
  importedLibrary,
  selectedCompareItems,
  liveResults,
  savedProducts,
  historyProducts,
  salesWeightPct,
  spendingLimitCredits,
  syncedCategoryCache,
  serverBudgetRemainingCredits,
  liveBalanceCredits,
  budgetStorageAvailable,
  quotaStatus,
  onSelectImportedEntry,
  onToggleCompareItem,
  onClearCompareSelection,
  onAddSimilarToCompare,
  onOpenProductFromSimilar,
  onHydrateOrEnrichProduct,
  onBudgetChanged,
  onResumeResearch,
}: ImportedPhase3WorkspaceProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const [activeTab, setActiveTab] = useState<Phase3ActiveTab>('comparison');

  const mergedLibraryEntries = useMemo<ImportedLibraryEntry[]>(() => {
    const activeCid = activeContext.canonicalProductId;
    const hasActive = importedLibrary.some((e) => e.canonicalProductId === activeCid);
    if (hasActive) return [...importedLibrary];
    return [contextToLibraryEntry(activeContext), ...importedLibrary];
  }, [importedLibrary, activeContext]);

  const importedPool = useMemo<ComparisonCandidateItem[]>(
    () =>
      mergedLibraryEntries.map((entry) => ({
        canonicalProductId: entry.canonicalProductId,
        product: entry.product,
        origin: entry.dataSource,
        importedAt: entry.importedAt,
      })),
    [mergedLibraryEntries]
  );

  const importedProducts = useMemo<ResearchProduct[]>(
    () => mergedLibraryEntries.map((entry) => entry.product),
    [mergedLibraryEntries]
  );

  const workspacePool = useMemo<ComparisonCandidateItem[]>(() => {
    const importedIds = new Set(importedPool.map((i) => i.canonicalProductId));
    const seen = new Set<string>(importedIds);
    const out: ComparisonCandidateItem[] = [];
    for (const p of [...liveResults, ...savedProducts, ...historyProducts]) {
      const cid = getCanonicalProductId(p);
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      out.push({
        canonicalProductId: cid,
        product: p,
        origin: 'workspace-pool',
      });
    }
    return out;
  }, [importedPool, liveResults, savedProducts, historyProducts]);

  const comparedProductIds = useMemo<ReadonlySet<string>>(
    () => new Set(selectedCompareItems.map((item) => item.canonicalProductId)),
    [selectedCompareItems]
  );

  const handleSimilarApiExecuted = (result: SimilarProductSearchResponse) => {
    if (result.apiCallsMade > 0) {
      onBudgetChanged();
    }
  };

  return (
    <section
      aria-labelledby="imported-phase3-heading"
      className="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-2xl overflow-hidden"
    >
      {/* Header + Library Switcher + Two Tabs */}
      <div className="px-4 sm:px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-zinc-700 dark:text-zinc-300 shrink-0" aria-hidden="true" />
              <h3
                id="imported-phase3-heading"
                className="font-display text-sm sm:text-base font-bold text-zinc-950 dark:text-zinc-50"
              >
                {t.phase3WorkspaceHeading}
              </h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-3xl">
              {t.phase3WorkspaceSubtitle}
            </p>
          </div>

          {/* Switch Active Reference Product across Previously Imported Products (0 cr) */}
          {mergedLibraryEntries.length > 1 && (
            <div className="flex items-center gap-2 shrink-0">
              <label
                htmlFor="phase3-active-reference-select"
                className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap"
              >
                {t.phase3SimilarRefLabel}:
              </label>
              <select
                id="phase3-active-reference-select"
                value={activeContext.canonicalProductId}
                onChange={(e) => {
                  const chosen = mergedLibraryEntries.find(
                    (entry) => entry.canonicalProductId === e.target.value
                  );
                  if (chosen) onSelectImportedEntry(chosen);
                }}
                className="min-h-[34px] max-w-[260px] px-2.5 py-1 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-950/15 dark:focus:ring-zinc-100/20"
              >
                {mergedLibraryEntries.map((entry) => (
                  <option key={entry.canonicalProductId} value={entry.canonicalProductId}>
                    {isMy ? entry.product.nameMy : entry.product.name} (#{entry.canonicalProductId})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Interactive Mode Tabs: Comparison & Similar Finder */}
        <div
          role="tablist"
          aria-label={t.phase3WorkspaceHeading}
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'comparison'}
            onClick={() => setActiveTab('comparison')}
            className={`inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-medium rounded-xl border transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'comparison'
                ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                : 'bg-zinc-50 dark:bg-zinc-950/50 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
            }`}
          >
            <GitCompareArrows className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.phase3TabComparison}</span>
            <span className="font-mono text-[11px] opacity-80 tabular-nums">
              ({selectedCompareItems.length})
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'similar'}
            onClick={() => setActiveTab('similar')}
            className={`inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-medium rounded-xl border transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'similar'
                ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                : 'bg-zinc-50 dark:bg-zinc-950/50 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
            }`}
          >
            <Search className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.phase3TabSimilar}</span>
          </button>
        </div>
      </div>

      {/* Active Tab Content */}
      <div className="p-4 sm:p-6">
        {activeTab === 'comparison' ? (
          <ImportedProductComparisonPanel
            language={language}
            salesWeightPct={salesWeightPct}
            selectedItems={selectedCompareItems}
            importedPool={importedPool}
            workspacePool={workspacePool}
            spendingLimitCredits={spendingLimitCredits}
            serverBudgetRemainingCredits={serverBudgetRemainingCredits}
            liveBalanceCredits={liveBalanceCredits}
            budgetStorageAvailable={budgetStorageAvailable}
            quotaStatus={quotaStatus}
            onToggleCandidate={onToggleCompareItem}
            onClearSelection={onClearCompareSelection}
            onHydrateCachedProduct={onHydrateOrEnrichProduct}
            onProductEnriched={onHydrateOrEnrichProduct}
            onBudgetChanged={onBudgetChanged}
            onResumeResearch={onResumeResearch}
          />
        ) : (
          <SimilarProductFinderPanel
            language={language}
            referenceProduct={activeContext.product}
            salesWeightPct={salesWeightPct}
            spendingLimitCredits={spendingLimitCredits}
            syncedCategoryCache={syncedCategoryCache}
            serverBudgetRemainingCredits={serverBudgetRemainingCredits}
            liveBalanceCredits={liveBalanceCredits}
            budgetStorageAvailable={budgetStorageAvailable}
            quotaStatus={quotaStatus}
            importedProducts={importedProducts}
            liveResults={liveResults}
            savedProducts={savedProducts}
            historyProducts={historyProducts}
            comparedProductIds={comparedProductIds}
            onAddToComparison={onAddSimilarToCompare}
            onOpenProductWorkspace={onOpenProductFromSimilar}
            onSimilarApiExecuted={handleSimilarApiExecuted}
            onResumeResearch={onResumeResearch}
          />
        )}
      </div>
    </section>
  );
}
