import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Bookmark,
  CheckCircle2,
  ClipboardPaste,
  Database,
  ExternalLink,
  History,
  ImageOff,
  Layers,
  Link2,
  Loader2,
  PlayCircle,
  RefreshCw,
  SearchCheck,
  SearchX,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  Language,
  LinkImportExecuteResponse,
  LinkImportInspectResponse,
  ProductCategory,
  ResearchProduct,
  ResearchQuotaStatus,
  SingleLinkResearchSource,
  SingleProductHistoryRecord,
  SyncedKalodataCategoryCache,
} from '../types/product';
import { buildResolvedCategoryIdMap, getCategoryLabel } from '../utils/categoryRegistry';
import { loadEnrichmentCache } from '../utils/enrichmentCache';
import {
  formatThb,
  getTikTokShopProductUrl,
  isSafeHttpUrl,
  resolveProductImageDisplayConfig,
} from '../utils/format';
import { formatCredits, KALODATA_PRODUCT_DETAIL_CREDIT } from '../utils/kalodataPricing';
import { evaluateProductOpportunity } from '../utils/scoring';
import { deriveProductDecisionSummary } from '../utils/productAnalytics';
import { formatResearchDateTime } from '../utils/savedProductsStorage';
import { TRANSLATIONS } from '../i18n/translations';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { InfoPopover } from './InfoPopover';
import { InlineDailyBudgetGuard } from './InlineDailyBudgetGuard';
import { ProductImage } from './ProductImage';
import { ScoreRing, StateMessage, StatusDot, VerdictBadge } from './visual';

interface ProductLinkImportPanelProps {
  language: Language;
  spendingLimitCredits: number;
  serverBudgetCommittedCredits?: number | null;
  onSpendingLimitChange?: (nextLimit: number) => void;
  salesWeightPct: number;
  syncedCategoryCache: SyncedKalodataCategoryCache;
  quotaStatus: ResearchQuotaStatus;
  existingResultIds: readonly string[];
  existingSavedIds: readonly string[];
  existingHistoryIds: readonly string[];
  existingSingleHistoryIds: readonly string[];
  budgetStorageAvailable: boolean;
  serverBudgetRemainingCredits: number | null;
  liveBalanceCredits: number | null;
  activeSingleResult: SingleProductHistoryRecord | null;
  singleHistoryCount: number;
  isSavedProduct: (product: ResearchProduct) => boolean;
  onFindExistingProduct: (canonicalProductId: string) => ResearchProduct | null;
  onOpenExistingAsSingleResult: (
    product: ResearchProduct,
    inspectResult: LinkImportInspectResponse
  ) => void;
  onClearActiveSingleResult: () => void;
  onOpenReport: (product: ResearchProduct) => void;
  onOpenDeepDive: (product: ResearchProduct) => void;
  onToggleSave: (product: ResearchProduct) => void;
  onViewSingleHistory: () => void;
  onProductImported: (result: LinkImportExecuteResponse) => void;
  onResumeResearch: () => Promise<void> | void;
  layout?: 'inline' | 'drawer';
  onClose?: () => void;
  compactTop?: boolean;
}

function tryExtractQuickProductId(rawInput: string): string | null {
  const match =
    rawInput.match(/\/(?:th\/)?pdp\/(?:[^/\s?#]+\/)?(\d{8,24})(?:[/?#]|$)/i) ??
    rawInput.match(/\/view\/product\/(\d{8,24})(?:[/?#]|$)/i) ??
    rawInput.match(/\/shop\/(?:pdp\/(?:[^/\s?#]+\/)?|p\/)(\d{8,24})(?:[/?#]|$)/i) ??
    rawInput.match(/[?&](?:product_id|productId)=(\d{8,24})\b/i);
  return match?.[1] ?? null;
}

function formatCompactNumber(val: number | null | undefined): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return '—';
  }
  return val.toLocaleString('en-US');
}

function formatDataSourceLabel(source: SingleLinkResearchSource, isMy: boolean): string {
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

export function ProductLinkImportPanel({
  language,
  spendingLimitCredits,
  serverBudgetCommittedCredits,
  onSpendingLimitChange,
  salesWeightPct,
  syncedCategoryCache,
  quotaStatus,
  existingResultIds,
  existingSavedIds,
  existingHistoryIds,
  existingSingleHistoryIds,
  budgetStorageAvailable,
  serverBudgetRemainingCredits,
  liveBalanceCredits,
  activeSingleResult,
  singleHistoryCount,
  isSavedProduct,
  onFindExistingProduct,
  onOpenExistingAsSingleResult,
  onClearActiveSingleResult,
  onOpenReport,
  onOpenDeepDive,
  onToggleSave,
  onViewSingleHistory,
  onProductImported,
  onResumeResearch,
  layout = 'inline',
  onClose,
  compactTop = false,
}: ProductLinkImportPanelProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const isDrawer = layout === 'drawer';
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const [rawInput, setRawInput] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [inspectResult, setInspectResult] = useState<LinkImportInspectResponse | null>(null);
  const [importError, setImportError] = useState<{
    en: string;
    my?: string;
    classification?: LinkImportInspectResponse['classification'];
    code?: string;
  } | null>(null);
  const [userConfirmedPaid, setUserConfirmedPaid] = useState(false);
  const [clipboardNotice, setClipboardNotice] = useState(false);
  const inspectControllerRef = useRef<AbortController | null>(null);

  useDialogA11y({
    isOpen: isDrawer,
    containerRef: drawerRef,
    onClose: () => onClose?.(),
    closeOnEscape: true,
  });

  const resolvedCategoryIdMap = useMemo<Partial<Record<ProductCategory, string>>>(
    () => buildResolvedCategoryIdMap(syncedCategoryCache),
    [syncedCategoryCache]
  );

  const combinedHistoryIds = useMemo(
    () => Array.from(new Set([...existingHistoryIds, ...existingSingleHistoryIds])),
    [existingHistoryIds, existingSingleHistoryIds]
  );

  const buildWorkspaceIdsPayload = () => ({
    results: existingResultIds,
    saved: existingSavedIds,
    history: combinedHistoryIds,
  });

  const handleInputChange = (nextValue: string) => {
    setRawInput(nextValue);
    setInspectResult(null);
    setImportError(null);
    setUserConfirmedPaid(false);
    setClipboardNotice(false);
  };

  const handleClear = () => {
    inspectControllerRef.current?.abort();
    setRawInput('');
    setInspectResult(null);
    setImportError(null);
    setUserConfirmedPaid(false);
    setClipboardNotice(false);
  };

  const handlePasteClipboard = async () => {
    setClipboardNotice(false);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          handleInputChange(text.trim());
          return;
        }
      }
      setClipboardNotice(true);
    } catch {
      setClipboardNotice(true);
    }
  };

  const handleInspectLink = async (overrideInput?: string) => {
    const targetInput = (overrideInput ?? rawInput).trim();
    inspectControllerRef.current?.abort();
    const controller = new AbortController();
    inspectControllerRef.current = controller;

    setIsInspecting(true);
    setImportError(null);
    setUserConfirmedPaid(false);

    try {
      const cache = loadEnrichmentCache();
      const quickProductId = tryExtractQuickProductId(targetInput);
      const clientCachedProductDetail =
        quickProductId && cache.products[quickProductId] ? cache.products[quickProductId] : null;

      const res = await fetch('/api/link-import/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          rawInput: targetInput,
          existingWorkspaceIds: buildWorkspaceIdsPayload(),
          clientCachedProductDetail,
          spendingLimitCredits,
        }),
      });

      const data = (await res.json().catch(() => null)) as LinkImportInspectResponse | null;
      if (!data || typeof data.classification !== 'string') {
        setInspectResult(null);
        setImportError({
          en: 'Unable to inspect the pasted link right now. Please try again.',
          my: 'ထည့်သွင်းထားသော Link ကို ယခုစစ်ဆေး၍မရပါ။ ထပ်မံစမ်းသပ်ပါ။',
          classification: 'invalid-link',
        });
        return;
      }

      setInspectResult(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setInspectResult(null);
      setImportError({
        en: err instanceof Error ? err.message : 'Network error while inspecting link.',
        classification: 'invalid-link',
      });
    } finally {
      if (inspectControllerRef.current === controller) {
        inspectControllerRef.current = null;
      }
      setIsInspecting(false);
    }
  };

  const handleExecuteImport = async (opts: { forceRefresh?: boolean; confirmed?: boolean }) => {
    if (!inspectResult?.ok || !inspectResult.productId) return;
    const isPaid = opts.forceRefresh === true || inspectResult.requiresPaidApiCall;
    if (isPaid && opts.confirmed !== true) return;

    setIsImporting(true);
    setImportError(null);

    try {
      const cache = loadEnrichmentCache();
      const pid = inspectResult.productId;
      const clientCachedPd = !opts.forceRefresh ? cache.products[pid] ?? null : null;
      const shopId = clientCachedPd?.productShopId?.trim() ?? null;
      const clientCachedShop = shopId ? cache.shops[shopId] ?? null : null;
      const clientCachedReview = cache.reviews[pid] ?? null;

      const idempotencyKey = `siampick-link-${pid}-${opts.forceRefresh ? 'refresh-' : ''}${Date.now()}`;

      const res = await fetch('/api/link-import/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawInput: rawInput.trim(),
          existingWorkspaceIds: buildWorkspaceIdsPayload(),
          clientCachedProductDetail: clientCachedPd,
          clientCachedShopDetail: clientCachedShop,
          clientCachedReviewInsight: clientCachedReview,
          resolvedCategoryIdMap,
          spendingLimitCredits,
          salesWeightPct,
          userConfirmedPaidExecution: opts.confirmed === true,
          forceRefresh: opts.forceRefresh === true,
          idempotencyKey,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | LinkImportExecuteResponse
        | {
            ok?: false;
            classification?: LinkImportInspectResponse['classification'];
            code?: string;
            error?: string;
            errorMy?: string;
          }
        | null;

      if (!res.ok || !data || !('product' in data)) {
        const errObj = data && 'error' in data ? data : null;
        if (errObj?.classification === 'product-not-found' && inspectResult) {
          setInspectResult({
            ...inspectResult,
            ok: false,
            classification: 'product-not-found',
            errorCode: 'PRODUCT_NOT_FOUND',
            messageEn: errObj.error ?? inspectResult.messageEn,
            messageMy: errObj.errorMy ?? inspectResult.messageMy,
            requiresPaidApiCall: false,
            requiresConfirmation: false,
          });
        }
        setImportError({
          en: errObj?.error ?? `Import failed (HTTP ${res.status}).`,
          my: errObj?.errorMy,
          classification: errObj?.classification,
          code: errObj?.code,
        });
        return;
      }

      setInspectResult(null);
      setUserConfirmedPaid(false);
      onProductImported(data);
    } catch (err) {
      setImportError({
        en: err instanceof Error ? err.message : 'Network error while researching product link.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const existingWorkspaceProduct = useMemo(() => {
    if (!inspectResult?.canonicalProductId) return null;
    return onFindExistingProduct(inspectResult.canonicalProductId);
  }, [inspectResult, onFindExistingProduct]);

  const effectiveUsedToday =
    inspectResult?.budgetSummary?.totalCommittedCredits ??
    serverBudgetCommittedCredits ??
    0;
  const effectiveRemainingBudget =
    serverBudgetRemainingCredits !== null && serverBudgetRemainingCredits !== undefined
      ? Math.max(0, serverBudgetRemainingCredits)
      : inspectResult?.budgetSummary?.remainingLimitCredits ??
        Math.max(0, Math.round((spendingLimitCredits - effectiveUsedToday) * 1000) / 1000);
  const effectiveStorageAvailable =
    inspectResult?.budgetSummary?.storageAvailable ?? budgetStorageAvailable;
  const effectiveBalance =
    inspectResult?.budgetSummary?.liveBalanceCredits ?? liveBalanceCredits;
  const effectivePaused = inspectResult?.quotaPaused || quotaStatus.paused;

  const isLimitExceeded =
    Boolean(inspectResult?.requiresPaidApiCall) &&
    (KALODATA_PRODUCT_DETAIL_CREDIT > spendingLimitCredits + 1e-6 ||
      effectiveRemainingBudget + 1e-6 < KALODATA_PRODUCT_DETAIL_CREDIT);
  const isBalanceInsufficient =
    Boolean(inspectResult?.requiresPaidApiCall) &&
    effectiveBalance !== null &&
    effectiveBalance + 1e-6 < KALODATA_PRODUCT_DETAIL_CREDIT;

  const canImportFromCache =
    Boolean(inspectResult?.ok) &&
    !inspectResult?.requiresPaidApiCall &&
    !inspectResult?.alreadyInWorkspace;

  const canExecutePaidImport =
    Boolean(inspectResult?.ok) &&
    Boolean(inspectResult?.requiresPaidApiCall) &&
    !inspectResult?.alreadyInWorkspace &&
    userConfirmedPaid &&
    !effectivePaused &&
    effectiveStorageAvailable &&
    !isLimitExceeded &&
    !isBalanceInsufficient &&
    !isImporting;

  const activeSingleEvaluation = useMemo(() => {
    if (!activeSingleResult) return null;
    return evaluateProductOpportunity(activeSingleResult.product, {
      salesWeightPct,
    });
  }, [activeSingleResult, salesWeightPct]);

  const renderFailureBanner = (
    classification: LinkImportInspectResponse['classification'],
    title: string,
    messageEn: string,
    messageMy?: string
  ) => {
    const IconComp =
      classification === 'product-not-found'
        ? SearchX
        : classification === 'unsupported-link'
          ? AlertTriangle
          : AlertCircle;

    return (
      <StateMessage
        variant="error"
        compact
        className="mt-4"
        icon={<IconComp className="w-4 h-4" aria-hidden="true" />}
        title={title}
        reason={isMy && messageMy ? messageMy : messageEn}
        actionLabel={t.linkImportClearBtn}
        onAction={handleClear}
      />
    );
  };

  const linkImportBodyContent = (
    <>
      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
        {t.linkImportSubtitle}
      </p>

      {/* URL Input Row */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleInspectLink();
        }}
        className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
      >
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            value={rawInput}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={t.linkImportInputPlaceholder}
            aria-label={t.linkImportHeading}
            className="w-full min-h-[42px] pl-3.5 pr-24 py-2 text-xs sm:text-sm bg-zinc-50/70 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950/15 dark:focus:ring-zinc-100/20 focus:border-zinc-500 dark:focus:border-zinc-500 font-mono"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {rawInput.trim().length > 0 ? (
              <button
                type="button"
                onClick={handleClear}
                aria-label={t.linkImportClearBtn}
                className="inline-flex items-center gap-1 min-h-[32px] px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md cursor-pointer"
              >
                <X className="w-3 h-3" aria-hidden="true" />
                <span>{t.linkImportClearBtn}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="inline-flex items-center gap-1 min-h-[32px] px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md cursor-pointer"
              >
                <ClipboardPaste className="w-3 h-3" aria-hidden="true" />
                <span>{t.linkImportPasteBtn}</span>
              </button>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={isInspecting || isImporting}
          className="sp-btn-primary min-h-[42px] w-full sm:w-auto sm:shrink-0"
        >
          {isInspecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span>{t.linkImportCheckingLabel}</span>
            </>
          ) : (
            <>
              <SearchCheck className="w-4 h-4" aria-hidden="true" />
              <span>{t.linkImportCheckBtn}</span>
            </>
          )}
        </button>
      </form>

      {clipboardNotice && (
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          {t.linkImportClipboardUnavailableNote}
        </p>
      )}

      {/* Classification Error Banner */}
      {inspectResult &&
        !inspectResult.ok &&
        renderFailureBanner(
          inspectResult.classification,
          inspectResult.classification === 'product-not-found'
            ? t.linkImportNotFoundTitle
            : inspectResult.classification === 'unsupported-link'
              ? t.linkImportUnsupportedTitle
              : t.linkImportInvalidTitle,
          inspectResult.messageEn,
          inspectResult.messageMy
        )}

      {/* Execution Error Banner */}
      {importError &&
        inspectResult?.ok &&
        renderFailureBanner(
          importError.classification ?? 'invalid-link',
          importError.classification === 'product-not-found'
            ? t.linkImportNotFoundTitle
            : t.linkImportInvalidTitle,
          importError.en,
          importError.my
        )}

      {/* Identified Product Inspection & Confirmation Band (Flat, Single-Surface) */}
      {inspectResult?.ok && inspectResult.productId && (
        <div className="mt-4 sp-surface-muted p-4 space-y-3.5">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              <span>{t.linkImportReadyTitle}</span>
            </div>

            {inspectResult.previewTitle && (
              <p className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-snug">
                {inspectResult.previewTitle}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-600 dark:text-zinc-400">{t.linkImportProductIdLabel}:</span>
                <span className="font-mono font-medium text-zinc-950 dark:text-zinc-50 tabular-nums">
                  {inspectResult.productId}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
                <span className="font-mono text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {inspectResult.requiresPaidApiCall
                    ? t.linkImportCostPaidLabel
                    : t.linkImportCostZeroLabel}
                </span>
              </div>
            </div>

            {inspectResult.canonicalUrl && isSafeHttpUrl(inspectResult.canonicalUrl) && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400 pt-0.5">
                <span>{t.linkImportCanonicalUrlLabel}:</span>
                <a
                  href={inspectResult.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-zinc-900 dark:text-zinc-200 hover:underline break-all"
                >
                  <span>{inspectResult.canonicalUrl}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                </a>
              </div>
            )}

            {inspectResult.redirectHops.length > 1 && (
              <p className="text-xs font-mono text-zinc-600 dark:text-zinc-400 tabular-nums">
                {t.linkImportRedirectChainLabel}: {inspectResult.redirectHops.length} hop(s)
              </p>
            )}
          </div>

          {/* Case A: Already Available Locally (0 cr) */}
          {inspectResult.alreadyInWorkspace && existingWorkspaceProduct && (
            <div className="pt-3 border-t border-zinc-200/80 dark:border-zinc-700/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.linkImportDuplicateTitle}
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {t.linkImportDuplicateDesc}{' '}
                  <span className="font-mono text-zinc-900 dark:text-zinc-200">
                    (
                    {inspectResult.alreadyInWorkspaceSources
                      .map((src) =>
                        src === 'results'
                          ? t.linkImportDuplicateSourceResults
                          : src === 'saved'
                            ? t.linkImportDuplicateSourceSaved
                            : t.linkImportDuplicateSourceHistory
                      )
                      .join(' · ')}
                    )
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onOpenExistingAsSingleResult(existingWorkspaceProduct, inspectResult);
                    setInspectResult(null);
                  }}
                  className="sp-btn-primary"
                >
                  <span>{t.linkImportViewExistingBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenReport(existingWorkspaceProduct)}
                  className="sp-btn-secondary"
                >
                  <span>{t.linkImportOpenReportBtn}</span>
                </button>
              </div>
            </div>
          )}

          {/* Case B: Cached in Server or Browser (0 cr) */}
          {canImportFromCache && (
            <div className="pt-3 border-t border-zinc-200/80 dark:border-zinc-700/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                {t.linkImportCacheNotice}
              </p>
              <button
                type="button"
                disabled={isImporting}
                onClick={() => void handleExecuteImport({ confirmed: false, forceRefresh: false })}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-700 dark:hover:bg-emerald-600 rounded-lg disabled:opacity-50 cursor-pointer whitespace-nowrap sm:shrink-0"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none shrink-0" aria-hidden="true" />
                    <span>{t.linkImportImportingLabel}</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{t.linkImportImportCachedBtn}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Case C: Uncached — Explicit Paid Confirmation Gate (0.1 cr) */}
          {inspectResult.requiresPaidApiCall && !inspectResult.alreadyInWorkspace && (
            <div className="pt-3 border-t border-zinc-200/80 dark:border-zinc-700/70 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.linkImportConfirmPromptTitle}
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {t.linkImportConfirmPromptDesc}
                  </p>
                </div>
                <div className="text-xs font-mono text-zinc-700 dark:text-zinc-300 tabular-nums shrink-0 space-y-0.5 sm:text-right">
                  <div>
                    {t.linkImportBudgetRemainingLabel}:{' '}
                    <strong>{formatCredits(effectiveRemainingBudget)} cr</strong>
                  </div>
                  {effectiveBalance !== null && (
                    <div>
                      {t.linkImportBalanceLabel}: <strong>{formatCredits(effectiveBalance)} cr</strong>
                    </div>
                  )}
                </div>
              </div>

              {effectivePaused && (
                <div className="p-3 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 dark:text-amber-100">
                  <span>{t.linkImportPausedBannerTitle}</span>
                  <button
                    type="button"
                    onClick={() => void onResumeResearch()}
                    className="sp-btn-primary"
                  >
                    <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.btnResumeAndRetry}</span>
                  </button>
                </div>
              )}

              <InlineDailyBudgetGuard
                language={language}
                dailyLimitCredits={spendingLimitCredits}
                usedCreditsToday={effectiveUsedToday}
                remainingCreditsToday={effectiveRemainingBudget}
                requiredCredits={KALODATA_PRODUCT_DETAIL_CREDIT}
                budgetStorageAvailable={effectiveStorageAvailable}
                onUpdateDailyLimit={onSpendingLimitChange}
                testId="link-import-inline-budget-guard"
              />

              {isBalanceInsufficient && (
                <p className="text-xs text-red-700 dark:text-red-400">
                  {isMy
                    ? `Kalodata လက်ကျန် Credit မလုံလောက်ပါ (${formatCredits(effectiveBalance ?? 0)} cr)။`
                    : `Insufficient Kalodata balance (${formatCredits(effectiveBalance ?? 0)} cr available; ${formatCredits(KALODATA_PRODUCT_DETAIL_CREDIT)} cr required).`}
                </p>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-zinc-200/70 dark:border-zinc-700/60">
                <label className="inline-flex items-center gap-2.5 min-h-[40px] text-xs text-zinc-800 dark:text-zinc-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={userConfirmedPaid}
                    onChange={(e) => setUserConfirmedPaid(e.target.checked)}
                    disabled={
                      effectivePaused ||
                      !effectiveStorageAvailable ||
                      isLimitExceeded ||
                      isBalanceInsufficient ||
                      isImporting
                    }
                    className="w-4 h-4 rounded-sm border-zinc-300 dark:border-zinc-600 accent-zinc-950 dark:accent-zinc-100 cursor-pointer shrink-0"
                  />
                  <span>{t.linkImportConfirmCheckboxLabel}</span>
                </label>

                <button
                  type="button"
                  disabled={!canExecutePaidImport}
                  onClick={() => void handleExecuteImport({ confirmed: true, forceRefresh: false })}
                  className="sp-btn-primary w-full sm:w-auto sm:shrink-0"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none shrink-0" aria-hidden="true" />
                      <span>{t.linkImportImportingLabel}</span>
                    </>
                  ) : (
                    <span>{t.linkImportConfirmExecuteBtn}</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unified Single Product Link Research Result (Matches SiamPick Visual Language) */}
      {activeSingleResult && activeSingleEvaluation && (
        <div
          role="region"
          aria-label={t.linkImportSuccessTitle}
          className="mt-4 border border-emerald-200/90 dark:border-emerald-800/70 bg-emerald-50/30 dark:bg-emerald-950/15 rounded-xl p-4 space-y-3.5"
        >
          {/* Status Header */}
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-emerald-200/70 dark:border-emerald-800/50">
            <div className="flex items-start gap-2 min-w-0">
              <CheckCircle2
                className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-0.5 text-xs min-w-0">
                <div className="font-semibold text-emerald-950 dark:text-emerald-100">
                  {t.linkImportSuccessTitle} ·{' '}
                  <span className="font-mono tabular-nums">
                    {formatCredits(activeSingleResult.estimatedCreditsCharged)} cr
                  </span>
                </div>
                <p className="text-emerald-900/90 dark:text-emerald-200/90 leading-relaxed">
                  {activeSingleResult.apiCallsMade === 0
                    ? t.linkImportSuccessCachedDesc
                    : t.linkImportSuccessPaidDesc}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClearActiveSingleResult}
              aria-label={t.confirmCancelBtn}
              className="w-9 h-9 -mt-1 -mr-1 inline-flex items-center justify-center text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Product Summary Row */}
          {(() => {
            const p = activeSingleResult.product;
            const imgConfig = resolveProductImageDisplayConfig(p);
            const saved = isSavedProduct(p);
            const decisionSummary = deriveProductDecisionSummary(p, activeSingleEvaluation);
            const commissionRate =
              p.commissionVerified && typeof p.commissionRate === 'number'
                ? `${p.commissionRate.toFixed(1)}%`
                : typeof p.kalodataMetrics?.commissionRatePct === 'number'
                  ? `${p.kalodataMetrics.commissionRatePct.toFixed(1)}%`
                  : '—';
            const missingNotes = isMy ? p.missingDataMy : p.missingDataEn;
            const derivedTiktokUrl = getTikTokShopProductUrl(p);
            const tiktokHref =
              activeSingleResult.canonicalUrl ??
              (isSafeHttpUrl(derivedTiktokUrl) ? derivedTiktokUrl : null);

            return (
              <div className="space-y-3.5">
                <div className="flex items-start gap-3.5">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shrink-0">
                    {imgConfig.canRender && imgConfig.src ? (
                      <ProductImage
                        src={imgConfig.src}
                        fallbackSrc={imgConfig.fallbackSrc}
                        productId={imgConfig.productId}
                        alt={p.name}
                        title={isMy ? p.nameMy : p.name}
                        unavailableLabel={t.cardImageUnverified}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageOff className="w-5 h-5 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {getCategoryLabel(p.category, language, { short: true })}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{formatDataSourceLabel(activeSingleResult.dataSource, isMy)}</span>
                      <span aria-hidden="true" className="hidden sm:inline">·</span>
                      <span className="hidden sm:inline font-mono tabular-nums">
                        {formatResearchDateTime(activeSingleResult.researchedAt, language)}
                      </span>
                    </div>

                    <h3 className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2">
                      {isMy ? p.nameMy : p.name}
                    </h3>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <VerdictBadge verdict={decisionSummary.verdict} language={language} size="sm" />
                      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                        <StatusDot
                          status={
                            activeSingleEvaluation.confidenceLevel === 'High'
                              ? 'verified'
                              : activeSingleEvaluation.confidenceLevel === 'Medium'
                                ? 'estimated'
                                : 'unverified'
                          }
                          language={language}
                        />
                        <span className="truncate max-w-[180px]">
                          {p.shopName || t.dataStatusLabels.unavailable}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <ScoreRing
                      value={activeSingleEvaluation.totalScore}
                      size={52}
                      tone={
                        decisionSummary.verdict === 'recommended'
                          ? 'emerald'
                          : decisionSummary.verdict === 'not-recommended'
                            ? 'red'
                            : decisionSummary.verdict === 'need-more-data'
                              ? 'zinc'
                              : 'amber'
                      }
                    />
                  </div>
                </div>

                {/* Key Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-emerald-200/60 dark:border-emerald-800/50 text-xs">
                  <div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {t.linkImportPriceLabel}
                    </div>
                    <div className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                      {typeof p.priceThb === 'number' ? formatThb(p.priceThb) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {t.linkImportSalesLabel}
                    </div>
                    <div className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                      {formatCompactNumber(p.kalodataMetrics?.salesVolume)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {t.linkImportRevenueLabel}
                    </div>
                    <div className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                      {typeof p.kalodataMetrics?.revenueThb === 'number'
                        ? formatThb(p.kalodataMetrics.revenueThb)
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {t.linkImportCommissionLabel}
                    </div>
                    <div className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                      {commissionRate}
                    </div>
                  </div>
                </div>

                {/* Honest Unavailable Data Notice */}
                {missingNotes.length > 0 && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    <strong className="text-zinc-800 dark:text-zinc-200">
                      {t.linkImportUnavailableHeading}:
                    </strong>{' '}
                    {missingNotes.slice(0, 3).join(' · ')}
                  </p>
                )}

                {/* Unified Product Actions */}
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenReport(p)}
                    className="col-span-2 sm:col-span-1 sp-btn-primary"
                  >
                    <span>{t.linkImportOpenReportBtn}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenDeepDive(p)}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-700 dark:hover:bg-emerald-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.linkImportDeepDiveBtn}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleSave(p)}
                    className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                      saved
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                        : 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
                    }`}
                  >
                    <Bookmark
                      className={`w-3.5 h-3.5 ${saved ? 'fill-current' : ''}`}
                      aria-hidden="true"
                    />
                    <span>{saved ? t.linkImportSavedBtn : t.linkImportSaveBtn}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onViewSingleHistory}
                    className="sp-btn-secondary"
                  >
                    <History className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="truncate">{t.linkImportViewInSingleHistoryBtn}</span>
                  </button>

                  {tiktokHref && (
                    <a
                      href={tiktokHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sp-btn-ghost"
                    >
                      <span>{t.linkImportOpenTikTokBtn}</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </>
  );

  if (isDrawer) {
    return (
      <div
        className="fixed inset-0 z-50 flex justify-end bg-zinc-950/40 dark:bg-black/65 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-import-heading"
        onClick={() => onClose?.()}
      >
        <div
          ref={drawerRef}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-3xl bg-white dark:bg-zinc-900 h-[100dvh] shadow-2xl flex flex-col focus:outline-none"
        >
          {/* Sticky Drawer Top Header */}
          <div className="shrink-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <Link2 className="w-4 h-4 text-zinc-700 dark:text-zinc-300 shrink-0" aria-hidden="true" />
              <h2
                id="link-import-heading"
                className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50 truncate"
              >
                {t.linkImportHeading}
              </h2>
              <InfoPopover
                variant="info"
                label={t.linkImportHeading}
                title={t.linkImportHeading}
                content={t.linkImportSupportedFormatsNote}
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {singleHistoryCount > 0 && (
                <button
                  type="button"
                  onClick={onViewSingleHistory}
                  className="sp-btn-secondary !min-h-[38px] sm:!min-h-[40px] !px-2.5 sm:!px-3 !py-1.5 text-xs whitespace-nowrap shrink-0"
                >
                  <History className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="hidden sm:inline">{t.linkImportViewInSingleHistoryBtn}</span>
                  <span className="font-mono tabular-nums">({singleHistoryCount})</span>
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t.reportClose}
                  className="w-10 h-10 rounded-lg inline-flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Independently Scrollable Drawer Body */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
            {linkImportBodyContent}
          </div>

          {/* Sticky Drawer Bottom Footer */}
          <div className="shrink-0 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2.5">
            <div className="text-xs text-zinc-600 dark:text-zinc-400 font-mono tabular-nums min-w-0 truncate">
              {t.linkImportBudgetRemainingLabel}:{' '}
              <strong className="text-zinc-950 dark:text-zinc-50">
                {formatCredits(effectiveRemainingBudget)} cr
              </strong>
              <span aria-hidden="true" className="mx-1.5 text-zinc-300 dark:text-zinc-700">
                ·
              </span>
              <span>{t.linkImportCostPaidLabel}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {activeSingleResult && (
                <button
                  type="button"
                  onClick={() => onOpenReport(activeSingleResult.product)}
                  className="sp-btn-primary min-h-[40px] px-4 py-2 text-xs whitespace-nowrap shrink-0"
                >
                  <span>{t.linkImportOpenReportBtn}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="sp-btn-secondary min-h-[40px] px-4 py-2 text-xs whitespace-nowrap shrink-0"
                >
                  {t.reportClose}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="link-import-heading"
      className={`${compactTop ? 'mt-2.5' : 'mt-4'} sp-card p-4 sm:p-5`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2.5 mb-1.5">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <Link2 className="w-4 h-4 text-zinc-700 dark:text-zinc-300 shrink-0" aria-hidden="true" />
          <h2
            id="link-import-heading"
            className={`font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50 ${
              isMy ? 'tracking-normal leading-[1.35]' : 'tracking-tight leading-[1.25]'
            }`}
          >
            {t.linkImportHeading}
          </h2>
          <InfoPopover
            variant="info"
            label={t.linkImportHeading}
            title={t.linkImportHeading}
            content={t.linkImportSupportedFormatsNote}
          />
        </div>

        {singleHistoryCount > 0 && (
          <button
            type="button"
            onClick={onViewSingleHistory}
            className="sp-btn-secondary w-full sm:w-auto sm:shrink-0"
          >
            <History className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              {t.linkImportViewInSingleHistoryBtn} ({singleHistoryCount})
            </span>
          </button>
        )}
      </div>

      {linkImportBodyContent}
    </section>
  );
}
