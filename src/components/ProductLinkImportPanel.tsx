import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  Database,
  ExternalLink,
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
  SyncedKalodataCategoryCache,
} from '../types/product';
import { buildResolvedCategoryIdMap } from '../utils/categoryRegistry';
import { loadEnrichmentCache } from '../utils/enrichmentCache';
import { isSafeHttpUrl } from '../utils/format';
import { formatCredits, KALODATA_PRODUCT_DETAIL_CREDIT } from '../utils/kalodataPricing';
import { TRANSLATIONS } from '../i18n/translations';
import { InfoPopover } from './InfoPopover';

interface ProductLinkImportPanelProps {
  language: Language;
  spendingLimitCredits: number;
  salesWeightPct: number;
  syncedCategoryCache: SyncedKalodataCategoryCache;
  quotaStatus: ResearchQuotaStatus;
  existingResultIds: readonly string[];
  existingSavedIds: readonly string[];
  existingHistoryIds: readonly string[];
  budgetStorageAvailable: boolean;
  serverBudgetRemainingCredits: number | null;
  liveBalanceCredits: number | null;
  onFindExistingProduct: (canonicalProductId: string) => ResearchProduct | null;
  onRestoreExistingToResults: (product: ResearchProduct) => void;
  onOpenExistingReport: (product: ResearchProduct) => void;
  onOpenExistingWorkspace?: (
    product: ResearchProduct,
    inspectResult: LinkImportInspectResponse
  ) => void;
  onOpenImportedDeepDive?: (product: ResearchProduct) => void;
  onProductImported: (result: LinkImportExecuteResponse) => void;
  onResumeResearch: () => Promise<void> | void;
  onScrollToResults: (productId: string) => void;
}

function tryExtractQuickProductId(rawInput: string): string | null {
  const match =
    rawInput.match(/\/(?:th\/)?pdp\/(?:[^/\s?#]+\/)?(\d{8,24})(?:[/?#]|$)/i) ??
    rawInput.match(/\/view\/product\/(\d{8,24})(?:[/?#]|$)/i) ??
    rawInput.match(/\/shop\/(?:pdp\/(?:[^/\s?#]+\/)?|p\/)(\d{8,24})(?:[/?#]|$)/i) ??
    rawInput.match(/[?&](?:product_id|productId)=(\d{8,24})\b/i);
  return match?.[1] ?? null;
}

export function ProductLinkImportPanel({
  language,
  spendingLimitCredits,
  salesWeightPct,
  syncedCategoryCache,
  quotaStatus,
  existingResultIds,
  existingSavedIds,
  existingHistoryIds,
  budgetStorageAvailable,
  serverBudgetRemainingCredits,
  liveBalanceCredits,
  onFindExistingProduct,
  onRestoreExistingToResults,
  onOpenExistingReport,
  onOpenExistingWorkspace,
  onOpenImportedDeepDive,
  onProductImported,
  onResumeResearch,
  onScrollToResults,
}: ProductLinkImportPanelProps) {
  const t = TRANSLATIONS[language];
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
  const [importedResult, setImportedResult] = useState<LinkImportExecuteResponse | null>(null);
  const [userConfirmedPaid, setUserConfirmedPaid] = useState(false);
  const [clipboardNotice, setClipboardNotice] = useState(false);
  const inspectControllerRef = useRef<AbortController | null>(null);

  const resolvedCategoryIdMap = useMemo<Partial<Record<ProductCategory, string>>>(
    () => buildResolvedCategoryIdMap(syncedCategoryCache),
    [syncedCategoryCache]
  );

  const buildWorkspaceIdsPayload = () => ({
    results: existingResultIds,
    saved: existingSavedIds,
    history: existingHistoryIds,
  });

  const handleInputChange = (nextValue: string) => {
    setRawInput(nextValue);
    setInspectResult(null);
    setImportError(null);
    setImportedResult(null);
    setUserConfirmedPaid(false);
    setClipboardNotice(false);
  };

  const handleClear = () => {
    inspectControllerRef.current?.abort();
    setRawInput('');
    setInspectResult(null);
    setImportError(null);
    setImportedResult(null);
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
    setImportedResult(null);
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

      setImportedResult(data);
      setUserConfirmedPaid(false);
      onProductImported(data);
    } catch (err) {
      setImportError({
        en: err instanceof Error ? err.message : 'Network error while importing product.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const existingWorkspaceProduct = useMemo(() => {
    if (!inspectResult?.canonicalProductId) return null;
    return onFindExistingProduct(inspectResult.canonicalProductId);
  }, [inspectResult, onFindExistingProduct]);

  const effectiveRemainingBudget =
    inspectResult?.budgetSummary?.remainingLimitCredits ??
    serverBudgetRemainingCredits ??
    spendingLimitCredits;
  const effectiveStorageAvailable =
    inspectResult?.budgetSummary?.storageAvailable ?? budgetStorageAvailable;
  const effectiveBalance =
    inspectResult?.budgetSummary?.liveBalanceCredits ?? liveBalanceCredits;
  const effectivePaused = inspectResult?.quotaPaused || quotaStatus.paused;

  const isLimitExceeded =
    Boolean(inspectResult?.requiresPaidApiCall) &&
    effectiveRemainingBudget + 1e-6 < KALODATA_PRODUCT_DETAIL_CREDIT;
  const isBalanceInsufficient =
    Boolean(inspectResult?.requiresPaidApiCall) &&
    effectiveBalance !== null &&
    effectiveBalance + 1e-6 < KALODATA_PRODUCT_DETAIL_CREDIT;

  const canImportFromCache =
    Boolean(inspectResult?.ok) &&
    !inspectResult?.requiresPaidApiCall &&
    !inspectResult?.alreadyInWorkspaceSources.includes('results');

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

  const renderFailureBanner = (
    classification: LinkImportInspectResponse['classification'],
    title: string,
    messageEn: string,
    messageMy?: string
  ) => {
    const isUnsupported = classification === 'unsupported-link';
    const IconComp =
      classification === 'product-not-found'
        ? SearchX
        : isUnsupported
          ? AlertTriangle
          : AlertCircle;
    const containerClass = isUnsupported
      ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70 text-amber-950 dark:text-amber-100'
      : 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-800/70 text-red-950 dark:text-red-100';
    const iconClass = isUnsupported
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400';

    return (
      <div
        role="alert"
        className={`mt-4 p-4 rounded-xl border text-xs sm:text-sm ${containerClass}`}
      >
        <div className="flex items-start gap-2.5">
          <IconComp className={`w-4 h-4 shrink-0 mt-0.5 ${iconClass}`} aria-hidden="true" />
          <div className="space-y-1 min-w-0">
            <div className="font-semibold">{title}</div>
            <p className="leading-relaxed opacity-90">
              {language === 'my' && messageMy ? messageMy : messageEn}
            </p>
            {inspectResult?.resolvedUrl &&
              inspectResult.resolvedUrl !== inspectResult.extractedInputUrl && (
                <p className="font-mono text-[11px] opacity-75 break-all">
                  {t.linkImportResolvedUrlLabel}: {inspectResult.resolvedUrl}
                </p>
              )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      aria-labelledby="link-import-heading"
      className="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 transition-colors"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 max-w-3xl">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-zinc-700 dark:text-zinc-300 shrink-0" aria-hidden="true" />
            <h2
              id="link-import-heading"
              className="font-display text-sm sm:text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50"
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
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {t.linkImportSubtitle}
          </p>
        </div>
      </div>

      {/* URL Input Row */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleInspectLink();
        }}
        className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
      >
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            value={rawInput}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={t.linkImportInputPlaceholder}
            aria-label={t.linkImportHeading}
            className="w-full min-h-[42px] pl-3.5 pr-20 py-2 text-xs sm:text-sm bg-zinc-50/70 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-950/15 dark:focus:ring-zinc-100/20 focus:border-zinc-400 dark:focus:border-zinc-600 font-mono"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {rawInput.trim().length > 0 ? (
              <button
                type="button"
                onClick={handleClear}
                aria-label={t.linkImportClearBtn}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg cursor-pointer"
              >
                <X className="w-3 h-3" aria-hidden="true" />
                <span>{t.linkImportClearBtn}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg cursor-pointer"
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
          className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-4 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-xl transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
        >
          {isInspecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
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
        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
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

      {/* Execution Error Banner (when inspect succeeded but import failed) */}
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

      {/* Identified Product Card */}
      {inspectResult?.ok && inspectResult.productId && !importedResult && (
        <div className="mt-4 p-4 sm:p-5 bg-zinc-50/70 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pt-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 dark:text-zinc-400">{t.linkImportProductIdLabel}:</span>
                  <span className="font-mono font-medium text-zinc-950 dark:text-zinc-50 tabular-nums">
                    {inspectResult.productId}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
                  <span className="font-mono text-zinc-800 dark:text-zinc-200 tabular-nums">
                    {inspectResult.requiresPaidApiCall
                      ? t.linkImportCostPaidLabel
                      : t.linkImportCostZeroLabel}
                  </span>
                </div>
              </div>

              {inspectResult.canonicalUrl && isSafeHttpUrl(inspectResult.canonicalUrl) && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-600 dark:text-zinc-400 pt-0.5">
                  <span>{t.linkImportCanonicalUrlLabel}:</span>
                  <a
                    href={inspectResult.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-zinc-800 dark:text-zinc-200 hover:underline break-all"
                  >
                    <span>{inspectResult.canonicalUrl}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                  </a>
                </div>
              )}

              {inspectResult.redirectHops.length > 1 && (
                <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {t.linkImportRedirectChainLabel}: {inspectResult.redirectHops.length} hop(s)
                </p>
              )}
            </div>
          </div>

          {/* Case A: Duplicate Already in Workspace */}
          {inspectResult.alreadyInWorkspace && (
            <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.linkImportDuplicateTitle}
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {t.linkImportDuplicateDesc}{' '}
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">
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
                {existingWorkspaceProduct && (
                  <>
                    {onOpenExistingWorkspace && (
                      <button
                        type="button"
                        onClick={() => onOpenExistingWorkspace(existingWorkspaceProduct, inspectResult)}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t.linkImportOpenWorkspaceBtn}</span>
                      </button>
                    )}
                    {!inspectResult.alreadyInWorkspaceSources.includes('results') && (
                      <button
                        type="button"
                        onClick={() => onRestoreExistingToResults(existingWorkspaceProduct)}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        <span>{t.linkImportRestoreToResultsBtn}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenExistingReport(existingWorkspaceProduct)}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      <span>{t.linkImportViewExistingBtn}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Case B: Cached in Server or Browser (0 cr) — not yet in active results */}
          {canImportFromCache && !inspectResult.alreadyInWorkspace && (
            <div className="p-3.5 bg-white dark:bg-zinc-900 border border-emerald-200/90 dark:border-emerald-800/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
                {t.linkImportCacheNotice}
              </p>
              <button
                type="button"
                disabled={isImporting}
                onClick={() => void handleExecuteImport({ confirmed: false, forceRefresh: false })}
                className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>{t.linkImportImportingLabel}</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.linkImportImportCachedBtn}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Case C: Uncached — Explicit Paid Confirmation Gate (0.1 cr) */}
          {inspectResult.requiresPaidApiCall && !inspectResult.alreadyInWorkspace && (
            <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3">
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
                <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 dark:text-amber-100">
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

              {!effectiveStorageAvailable && (
                <p className="text-xs text-red-700 dark:text-red-400">
                  {t.linkImportStorageBlockedNote}
                </p>
              )}

              {isLimitExceeded && (
                <p className="text-xs text-red-700 dark:text-red-400">
                  {t.linkImportLimitExceededNote}
                </p>
              )}

              {isBalanceInsufficient && (
                <p className="text-xs text-red-700 dark:text-red-400">
                  {language === 'my'
                    ? `Kalodata လက်ကျန် Credit မလုံလောက်ပါ (${formatCredits(effectiveBalance ?? 0)} cr)။`
                    : `Insufficient Kalodata balance (${formatCredits(effectiveBalance ?? 0)} cr available; ${formatCredits(KALODATA_PRODUCT_DETAIL_CREDIT)} cr required).`}
                </p>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                <label className="inline-flex items-center gap-2 text-xs text-zinc-800 dark:text-zinc-200 cursor-pointer select-none">
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
                    className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 text-zinc-950 focus:ring-zinc-950 cursor-pointer"
                  />
                  <span>{t.linkImportConfirmCheckboxLabel}</span>
                </label>

                <button
                  type="button"
                  disabled={!canExecutePaidImport}
                  onClick={() => void handleExecuteImport({ confirmed: true, forceRefresh: false })}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-4 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-lg disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
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

      {/* Import Success Strip */}
      {importedResult && (
        <div
          role="status"
          className="mt-4 p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <CheckCircle2
              className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-1 text-xs min-w-0">
              <div className="font-semibold text-emerald-950 dark:text-emerald-100">
                {t.linkImportSuccessTitle} —{' '}
                <span className="font-mono tabular-nums">
                  {formatCredits(importedResult.estimatedCreditsCharged)} cr
                </span>
              </div>
              <p className="text-emerald-900 dark:text-emerald-200 truncate font-medium">
                {importedResult.product.name}
              </p>
              <p className="text-emerald-800 dark:text-emerald-300 leading-relaxed">
                {importedResult.apiCallsMade === 0
                  ? t.linkImportSuccessCachedDesc
                  : t.linkImportSuccessPaidDesc}
              </p>
              {importedResult.unmappedCategoryNoteEn && (
                <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {language === 'my' && importedResult.unmappedCategoryNoteMy
                    ? importedResult.unmappedCategoryNoteMy
                    : importedResult.unmappedCategoryNoteEn}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenImportedDeepDive && (
              <button
                type="button"
                onClick={() => onOpenImportedDeepDive(importedResult.product)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.linkImportDeepDiveBtn}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onScrollToResults(importedResult.product.id)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <span>{t.linkImportScrollToProductBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenExistingReport(importedResult.product)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <span>{t.linkImportOpenReportBtn}</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
