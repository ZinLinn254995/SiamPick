import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Box,
} from 'lucide-react';
import type {
  AiProductAnalysis,
  AiRecommendationVerdict,
  DataStatus,
  Language,
  OpportunityEvaluation,
  ResearchProduct,
} from '../types/product';
import {
  buildAiAnalysisDataBasis,
  buildKalodataFallbackAnalysis,
  computeProductDataFingerprint,
} from '../utils/aiAnalysisFallback';
import {
  getCachedAiAnalysisForProduct,
  saveCachedAiAnalysis,
} from '../utils/aiAnalysisCache';
import { formatResearchDateTime } from '../utils/savedProductsStorage';
import { TRANSLATIONS } from '../i18n/translations';
import { InfoPopover } from './InfoPopover';

interface AiProductAnalysisSectionProps {
  product: ResearchProduct;
  evaluation: OpportunityEvaluation;
  salesWeightPct: number;
  peerProducts?: readonly ResearchProduct[];
  language: Language;
  onAnalysisReady?: (analysis: AiProductAnalysis | null) => void;
}

const CLIENT_ANALYZE_TIMEOUT_MS = 65_000;

function statusTextColor(status: DataStatus): string {
  if (status === 'verified') return 'text-emerald-700 dark:text-emerald-400';
  if (status === 'estimated') return 'text-amber-700 dark:text-amber-400';
  if (status === 'unverified') return 'text-zinc-500 dark:text-zinc-400';
  return 'text-zinc-400 dark:text-zinc-500';
}

function verdictStyle(verdict: AiRecommendationVerdict): {
  container: string;
  label: string;
} {
  switch (verdict) {
    case 'priority-test':
      return {
        container: 'bg-emerald-50/70 dark:bg-emerald-950/35 border-emerald-200/90 dark:border-emerald-800/60',
        label: 'text-emerald-800 dark:text-emerald-300',
      };
    case 'test-with-caution':
      return {
        container: 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/90 dark:border-amber-800/60',
        label: 'text-amber-800 dark:text-amber-300',
      };
    case 'monitor':
      return {
        container: 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200/90 dark:border-zinc-800',
        label: 'text-zinc-800 dark:text-zinc-200',
      };
    default:
      return {
        container: 'bg-zinc-100/80 dark:bg-zinc-800/80 border-zinc-300/90 dark:border-zinc-700',
        label: 'text-zinc-700 dark:text-zinc-300',
      };
  }
}

export function AiProductAnalysisSection({
  product,
  evaluation,
  salesWeightPct,
  peerProducts,
  language,
  onAnalysisReady,
}: AiProductAnalysisSectionProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  const [analysis, setAnalysis] = useState<AiProductAnalysis | null>(null);
  const [previousAnalyses, setPreviousAnalyses] = useState<AiProductAnalysis[]>([]);
  const [showPreviousHistory, setShowPreviousHistory] = useState(false);
  const [loadedFromCache, setLoadedFromCache] = useState(false);
  const [hasNewerData, setHasNewerData] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cacheWarning, setCacheWarning] = useState<string | null>(null);
  const [reanalyzeFailedNotice, setReanalyzeFailedNotice] = useState<{
    en: string;
    my: string;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const onAnalysisReadyRef = useRef(onAnalysisReady);
  onAnalysisReadyRef.current = onAnalysisReady;

  const currentFingerprint = computeProductDataFingerprint(product);

  // Hydrate strictly from local cache whenever product identity OR enriched Kalodata data changes — ZERO automatic Gemini API calls
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightRef.current = false;
    setIsAnalyzing(false);
    setConfirmOpen(false);
    setCacheWarning(null);
    setReanalyzeFailedNotice(null);
    setShowPreviousHistory(false);

    const lookup = getCachedAiAnalysisForProduct(product);
    if (lookup.entry) {
      setAnalysis(lookup.entry.analysis);
      setPreviousAnalyses(lookup.entry.previousAnalyses ?? []);
      setLoadedFromCache(true);
      setHasNewerData(lookup.hasNewerData);
      onAnalysisReadyRef.current?.(lookup.entry.analysis);
    } else {
      setAnalysis(null);
      setPreviousAnalyses([]);
      setLoadedFromCache(false);
      setHasNewerData(false);
      onAnalysisReadyRef.current?.(null);
    }

    return () => {
      abortRef.current?.abort();
    };
    // Re-run when product identity or enriched Kalodata data fingerprint changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, product.kalodataMetrics?.productId, product.researchedAt, currentFingerprint]);

  const handlePreviewFallback = () => {
    const preview = buildKalodataFallbackAnalysis(product, evaluation, {
      isManualPreview: true,
    });
    setAnalysis(preview);
    setLoadedFromCache(false);
    setHasNewerData(false);
    setConfirmOpen(false);
    setReanalyzeFailedNotice(null);
    onAnalysisReadyRef.current?.(preview);
  };

  const handleConfirmRunGemini = async () => {
    if (inFlightRef.current || isAnalyzing) return;
    inFlightRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, CLIENT_ANALYZE_TIMEOUT_MS);

    setConfirmOpen(false);
    setIsAnalyzing(true);
    setCacheWarning(null);
    setReanalyzeFailedNotice(null);

    const previousCachedGemini =
      analysis && analysis.source === 'gemini' && !analysis.geminiFailed ? analysis : null;

    try {
      const response = await fetch('/api/analyze-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product,
          salesWeightPct,
          peerProducts: peerProducts?.slice(0, 40),
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        analysis?: AiProductAnalysis;
        error?: string;
        errorMy?: string;
      } | null;

      if (!response.ok || !payload?.ok || !payload.analysis) {
        const fallback = buildKalodataFallbackAnalysis(product, evaluation, {
          code: response.status >= 500 ? 'UPSTREAM_ERROR' : 'INVALID_RESPONSE',
          detail: payload?.error ?? `HTTP ${response.status}`,
        });

        if (previousCachedGemini) {
          setReanalyzeFailedNotice({
            en:
              fallback.fallbackNoticeEn ??
              'Gemini AI re-analysis failed. Keeping your previously saved Gemini AI analysis below.',
            my:
              fallback.fallbackNoticeMy ??
              'Gemini AI ပြန်သုံးသပ်မှု မအောင်မြင်ပါ။ အရင်သိမ်းထားပြီးသား Gemini AI သုံးသပ်ချက်ကို ဆက်လက်ဖော်ပြထားပါသည်။',
          });
        } else {
          setAnalysis(fallback);
          setLoadedFromCache(false);
          setHasNewerData(false);
          onAnalysisReadyRef.current?.(fallback);
        }
        return;
      }

      const result = payload.analysis;

      if (result.source === 'gemini' && !result.geminiFailed) {
        const saveRes = saveCachedAiAnalysis(result);
        if (!saveRes.ok) {
          setCacheWarning(isMy ? (saveRes.errorMy ?? saveRes.errorEn ?? null) : (saveRes.errorEn ?? null));
        }
        const refreshed = getCachedAiAnalysisForProduct(product);
        setPreviousAnalyses(refreshed.entry?.previousAnalyses ?? []);
        setAnalysis(result);
        setLoadedFromCache(false);
        setHasNewerData(false);
        onAnalysisReadyRef.current?.(result);
      } else {
        // Server returned a Kalodata fallback because Gemini failed
        if (previousCachedGemini) {
          setReanalyzeFailedNotice({
            en:
              result.fallbackNoticeEn ??
              'Gemini AI re-analysis failed. Keeping your previously saved Gemini AI analysis below.',
            my:
              result.fallbackNoticeMy ??
              'Gemini AI ပြန်သုံးသပ်မှု မအောင်မြင်ပါ။ အရင်သိမ်းထားပြီးသား Gemini AI သုံးသပ်ချက်ကို ဆက်လက်ဖော်ပြထားပါသည်။',
          });
        } else {
          setAnalysis(result);
          setLoadedFromCache(false);
          setHasNewerData(false);
          onAnalysisReadyRef.current?.(result);
        }
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      const fallback = buildKalodataFallbackAnalysis(product, evaluation, {
        code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      });

      if (previousCachedGemini) {
        setReanalyzeFailedNotice({
          en:
            fallback.fallbackNoticeEn ??
            'Gemini AI re-analysis failed due to network/timeout. Keeping your previously saved Gemini AI analysis.',
          my:
            fallback.fallbackNoticeMy ??
            'Network သို့မဟုတ် Timeout ကြောင့် ပြန်သုံးသပ်မှု မအောင်မြင်ပါ။ အရင်သိမ်းထားပြီးသား Gemini AI သုံးသပ်ချက်ကို ဆက်လက်ဖော်ပြထားပါသည်။',
        });
      } else {
        setAnalysis(fallback);
        setLoadedFromCache(false);
        setHasNewerData(false);
        onAnalysisReadyRef.current?.(fallback);
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsAnalyzing(false);
      }
      inFlightRef.current = false;
    }
  };

  const liveDataBasis = analysis?.dataBasis ?? buildAiAnalysisDataBasis(product, evaluation);
  const isModelFormat = analysis?.aiContentSuitability.adFormat === 'ai-virtual-female-model';

  return (
    <section
      id="rep-ai-analysis"
      className="scroll-mt-4 pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-zinc-900 dark:text-zinc-100 shrink-0" aria-hidden="true" />
          <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {t.aiSectionHeading}
          </h3>
          <InfoPopover
            variant="info"
            label={t.aiSectionHeading}
            title={t.aiSectionHeading}
            content={t.aiSectionSubtitle}
          />
        </div>

        <div className="text-xs font-medium shrink-0">
          {analysis ? (
            analysis.source === 'gemini' ? (
              <span className="text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{loadedFromCache ? t.aiBadgeGeminiCached : t.aiBadgeGeminiLive}</span>
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">{t.aiBadgeFallback}</span>
            )
          ) : (
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{t.aiBadgeReady}</span>
          )}
        </div>
      </div>

      {/* Gemini Failure / Fallback Notice Banner (Requirement 7) */}
      {((analysis && analysis.geminiFailed) || reanalyzeFailedNotice) && (
        <div
          role="status"
          className="p-4 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-700/60 text-xs text-amber-950 dark:text-amber-200 space-y-2.5"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <div className="font-semibold text-amber-950 dark:text-amber-200">{t.aiFallbackBannerTitle}</div>
              <p className="text-amber-900 dark:text-amber-200 leading-relaxed">
                {reanalyzeFailedNotice
                  ? isMy
                    ? reanalyzeFailedNotice.my
                    : reanalyzeFailedNotice.en
                  : isMy
                    ? analysis?.fallbackNoticeMy
                    : analysis?.fallbackNoticeEn}
              </p>
            </div>
          </div>

          {!isAnalyzing && !confirmOpen && (
            <div className="pl-6">
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium text-amber-950 dark:text-amber-200 bg-white dark:bg-zinc-900 border border-amber-300 dark:border-amber-700/70 rounded-lg hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.aiRetryGeminiBtn}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stale Cache Notice Banner — Asks User Confirmation Before Re-Analyzing (Requirement 10) */}
      {analysis && analysis.source === 'gemini' && hasNewerData && !reanalyzeFailedNotice && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300/90 dark:border-zinc-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
          <div className="space-y-0.5">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100">{t.aiStaleDataBannerTitle}</div>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">{t.aiStaleDataBannerDesc}</p>
          </div>
          {!isAnalyzing && !confirmOpen && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.aiReanalyzeBtn}</span>
            </button>
          )}
        </div>
      )}

      {/* LocalStorage Cache Quota Warning (if cache save hit browser limit) */}
      {cacheWarning && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200">
          {cacheWarning}
        </div>
      )}

      {/* Explicit Cost & Confirmation Gate Before EVERY Gemini API Call */}
      {confirmOpen && !isAnalyzing && (
        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 space-y-3 text-xs">
          <div className="space-y-1">
            <div className="font-display font-semibold text-zinc-950 dark:text-zinc-50">{t.aiConfirmTitle}</div>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">{t.aiConfirmDesc}</p>
          </div>
          <ul className="space-y-1 text-zinc-700 dark:text-zinc-300 list-disc pl-4 marker:text-zinc-400">
            <li className="font-medium text-zinc-900 dark:text-zinc-100">{t.aiConfirmCallDetail}</li>
            <li className="text-emerald-800 dark:text-emerald-300 font-medium">{t.aiConfirmKalodataCost}</li>
            <li>{t.aiConfirmTokenNote}</li>
            <li>{t.aiConfirmCacheNote}</li>
          </ul>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleConfirmRunGemini}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-2 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-lg transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.aiConfirmProceedBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="inline-flex items-center min-h-[38px] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-lg transition-colors cursor-pointer"
            >
              {t.aiConfirmCancelBtn}
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isAnalyzing && (
        <div className="p-6 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-900 dark:text-zinc-100 shrink-0" aria-hidden="true" />
          <span>{t.aiAnalyzingLabel}</span>
        </div>
      )}

      {/* Empty Ready State (No Cached Analysis Yet — Zero Auto API Calls) */}
      {!analysis && !isAnalyzing && (
        <div className="p-5 rounded-xl bg-zinc-50/90 dark:bg-zinc-800/60 border border-zinc-200/90 dark:border-zinc-800 space-y-4">
          <div className="flex items-center gap-1.5">
            <h4 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">{t.aiEmptyTitle}</h4>
            <InfoPopover
              variant="info"
              label={t.aiEmptyTitle}
              title={t.aiEmptyTitle}
              content={t.aiEmptyDesc}
            />
          </div>

          {/* Factual Kalodata Basis Preview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-zinc-200/80 dark:border-zinc-800/80">
            {liveDataBasis.slice(0, 4).map((fact) => (
              <div key={fact.key} className="text-xs">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {isMy ? fact.labelMy : fact.labelEn}
                </div>
                <div className="font-mono text-xs font-medium text-zinc-900 dark:text-zinc-100 tabular-nums truncate">
                  {isMy ? fact.valueMy : fact.valueEn}
                </div>
                <div className={`text-xs font-medium ${statusTextColor(fact.status)}`}>
                  {t.dataStatusLabels[fact.status]}
                </div>
              </div>
            ))}
          </div>

          {!confirmOpen && (
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-lg transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.aiRunAnalysisBtn}</span>
              </button>
              <button
                type="button"
                onClick={handlePreviewFallback}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-zinc-50 rounded-lg transition-colors cursor-pointer"
              >
                <Database className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                <span>{t.aiPreviewFallbackBtn}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Completed 10-Point Analysis Display (Gemini or Kalodata Fallback) */}
      {analysis && !isAnalyzing && (
        <div className="space-y-5">
          {/* Block A: Strictly Factual Kalodata Market Data Basis */}
          <div className="p-4 rounded-xl bg-zinc-50/90 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-800/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                <Database className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" aria-hidden="true" />
                <span>{t.aiDataBasisHeading}</span>
                <InfoPopover
                  variant="info"
                  label={t.aiDataBasisHeading}
                  title={t.aiDataBasisHeading}
                  content={t.aiDataSeparationNote}
                />
              </div>
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                {t.cardConfidence}: {t.confidenceLabels[analysis.overallDataConfidence]}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5 pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70">
              {analysis.dataBasis.map((fact) => (
                <div key={fact.key} className="min-w-0">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {isMy ? fact.labelMy : fact.labelEn}
                  </div>
                  <div className="font-mono text-xs font-medium text-zinc-950 dark:text-zinc-50 tabular-nums truncate">
                    {isMy ? fact.valueMy : fact.valueEn}
                  </div>
                  <div className={`text-xs font-medium ${statusTextColor(fact.status)}`}>
                    {t.dataStatusLabels[fact.status]}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Block B: AI Strategic Interpretation (All 10 Structured Sections) */}
          <div className="space-y-5">
            <div className="flex items-center gap-1.5">
              <h4 className="font-display text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {t.aiInterpretationHeading}
              </h4>
              <InfoPopover
                variant="help"
                label={t.aiInterpretationHeading}
                title={t.aiInterpretationHeading}
                content={t.aiInterpretationNote}
              />
            </div>

            {/* Phase 8: Category Alignment Unverified Warning Banner */}
            {analysis.categoryVerificationStatus === 'unverified' && (
              <div
                role="status"
                className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300/90 dark:border-amber-700/70 flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200"
              >
                <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-0.5">
                  <div className="font-semibold">{t.aiCategoryUnverifiedTitle}</div>
                  <p className="text-amber-900 dark:text-amber-200 leading-relaxed">
                    {isMy
                      ? analysis.categoryVerificationNoteMy ?? analysis.categoryVerificationNoteEn
                      : analysis.categoryVerificationNoteEn ?? analysis.categoryVerificationNoteMy}
                  </p>
                </div>
              </div>
            )}

            {/* 10 (Surfaced Top Summary): Final Recommendation */}
            {(() => {
              const style = verdictStyle(analysis.finalRecommendation.verdict);
              return (
                <div className={`p-4 rounded-xl border space-y-2 ${style.container}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-display text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {t.aiSecFinalRecommendation}
                    </span>
                    <span className={`text-xs font-semibold ${style.label}`}>
                      {t.aiVerdictLabels[analysis.finalRecommendation.verdict]}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                    {isMy
                      ? analysis.finalRecommendation.headlineMy
                      : analysis.finalRecommendation.headlineEn}
                  </p>
                  <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                    <strong className="font-medium text-zinc-900 dark:text-zinc-100">{t.aiNextActionLabel}:</strong>{' '}
                    {isMy
                      ? analysis.finalRecommendation.actionPlanMy
                      : analysis.finalRecommendation.actionPlanEn}
                  </p>
                </div>
              );
            })()}

            {/* 01. Product Strengths & Weaknesses */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 space-y-2">
                <h5 className="font-display text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  {t.aiSecStrengths}
                </h5>
                <ul className="space-y-1.5 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-emerald-600">
                  {(isMy ? analysis.strengthsMy : analysis.strengthsEn).map((item, i) => (
                    <li key={`${i}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 space-y-2">
                <h5 className="font-display text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {t.aiSecWeaknesses}
                </h5>
                <ul className="space-y-1.5 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-zinc-400">
                  {(isMy ? analysis.weaknessesMy : analysis.weaknessesEn).map((item, i) => (
                    <li key={`${i}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 02, 03, 04, 05: Sales & Revenue, Growth, Commission, Competition */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h5 className="font-display text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.aiSecSalesRevenue}
                  </h5>
                  <span
                    className={`text-xs font-medium shrink-0 ${statusTextColor(analysis.salesAndRevenueStatus)}`}
                  >
                    {t.dataStatusLabels[analysis.salesAndRevenueStatus]}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {isMy ? analysis.salesAndRevenueMy : analysis.salesAndRevenueEn}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h5 className="font-display text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.aiSecGrowthPotential}
                  </h5>
                  <span
                    className={`text-xs font-medium shrink-0 ${statusTextColor(analysis.growthPotentialStatus)}`}
                  >
                    {t.dataStatusLabels[analysis.growthPotentialStatus]}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {isMy ? analysis.growthPotentialMy : analysis.growthPotentialEn}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h5 className="font-display text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.aiSecCommissionPotential}
                  </h5>
                  <span
                    className={`text-xs font-medium shrink-0 ${statusTextColor(analysis.commissionPotentialStatus)}`}
                  >
                    {t.dataStatusLabels[analysis.commissionPotentialStatus]}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {isMy ? analysis.commissionPotentialMy : analysis.commissionPotentialEn}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h5 className="font-display text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.aiSecCompetition}
                  </h5>
                  <span
                    className={`text-xs font-medium shrink-0 ${statusTextColor(analysis.competitionStatus)}`}
                  >
                    {t.dataStatusLabels[analysis.competitionStatus]}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {isMy ? analysis.competitionAnalysisMy : analysis.competitionAnalysisEn}
                </p>
              </div>
            </div>

            {/* 06. Target Customer Profile & 07. Why Choose This Product */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h5 className="font-display text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.aiSecTargetCustomer}
                  </h5>
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400 shrink-0">
                    {t.aiInferenceBadge} · {t.dataStatusLabels[analysis.targetCustomerStatus]}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {isMy ? analysis.targetCustomerMy : analysis.targetCustomerEn}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 space-y-1.5">
                <h5 className="font-display text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.aiSecWhyChoose}
                </h5>
                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {isMy ? analysis.whyChooseMy : analysis.whyChooseEn}
                </p>
              </div>
            </div>

            {/* 08. Potential Risks & Drawbacks */}
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 space-y-2">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" aria-hidden="true" />
                <h5 className="font-display text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.aiSecRisksDrawbacks}
                </h5>
              </div>
              <ul className="space-y-1.5 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-amber-600">
                {(isMy ? analysis.risksAndDrawbacksMy : analysis.risksAndDrawbacksEn).map(
                  (risk, i) => (
                    <li key={`${i}-${risk}`}>{risk}</li>
                  )
                )}
              </ul>
            </div>

            {/* 08b. Category-Tailored Affiliate Strategy (Phase 8) */}
            {(analysis.affiliateStrategyEn || analysis.affiliateStrategyMy) && (
              <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 space-y-1.5">
                <h5 className="font-display text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.aiAffiliateStrategyHeading}
                </h5>
                <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {isMy
                    ? analysis.affiliateStrategyMy ?? analysis.affiliateStrategyEn
                    : analysis.affiliateStrategyEn ?? analysis.affiliateStrategyMy}
                </p>
              </div>
            )}

            {/* 09. AI Advertising Content Suitability (Universal Category-Aware Ad Format) */}
            <div className="p-4 sm:p-5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/90 dark:border-zinc-800 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {isModelFormat ? (
                    <UserCheck className="w-4 h-4 text-zinc-800 dark:text-zinc-200 shrink-0" aria-hidden="true" />
                  ) : (
                    <Box className="w-4 h-4 text-zinc-800 dark:text-zinc-200 shrink-0" aria-hidden="true" />
                  )}
                  <div>
                    <h5 className="font-display text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                      {t.aiSecAdSuitability}
                    </h5>
                    <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {t.aiAdFormatLabels[analysis.aiContentSuitability.adFormat] ??
                        t.aiAdFormatBeauty}
                    </div>
                  </div>
                </div>

                <div className="text-right text-xs">
                  <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.aiVideoLabels[analysis.aiContentSuitability.suitabilityRating]}
                  </div>
                  <div className={`font-medium ${statusTextColor(analysis.aiContentSuitability.status)}`}>
                    {t.aiAssessmentBadge} · {t.dataStatusLabels[analysis.aiContentSuitability.status]}
                  </div>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                {isMy
                  ? analysis.aiContentSuitability.summaryMy
                  : analysis.aiContentSuitability.summaryEn}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-200/80 dark:border-zinc-800/80">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {t.aiAdAnglesHeading}
                  </div>
                  <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-zinc-400">
                    {(isMy
                      ? analysis.aiContentSuitability.creativeAnglesMy
                      : analysis.aiContentSuitability.creativeAnglesEn
                    ).map((angle, i) => (
                      <li key={`${i}-${angle}`}>{angle}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    {t.aiAdCautionsHeading}
                  </div>
                  <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-amber-600">
                    {(isMy
                      ? analysis.aiContentSuitability.cautionsMy
                      : analysis.aiContentSuitability.cautionsEn
                    ).map((caution, i) => (
                      <li key={`${i}-${caution}`}>{caution}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Footer Metadata + Explicit Manual Re-Analyze Control */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums">
                <span>
                  {t.aiAnalyzedAtLabel}: {formatResearchDateTime(analysis.analyzedAt, language)}
                </span>
                {analysis.modelUsed && (
                  <span>
                    · {t.aiModelLabel}: {analysis.modelUsed}
                  </span>
                )}
                {analysis.source === 'gemini' && (
                  <span className="font-sans text-emerald-700 dark:text-emerald-400 font-medium">
                    · {t.aiCachedLocallyLabel}
                  </span>
                )}
                {previousAnalyses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPreviousHistory((prev) => !prev)}
                    className="font-sans text-zinc-700 dark:text-zinc-300 underline underline-offset-2 hover:text-zinc-950 dark:hover:text-zinc-50 cursor-pointer"
                  >
                    {isMy
                      ? showPreviousHistory
                        ? 'ယခင် AI သုံးသပ်ချက်များ ပိတ်ရန်'
                        : `ယခင် AI သုံးသပ်ချက် (${previousAnalyses.length}) ကြည့်ရန်`
                      : showPreviousHistory
                        ? 'Hide previous AI analyses'
                        : `Previous AI analyses (${previousAnalyses.length})`}
                  </button>
                )}
              </div>

              {!confirmOpen && (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 min-h-[32px] px-3 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-zinc-50 rounded-lg transition-colors cursor-pointer"
                >
                  {analysis.source === 'gemini' ? (
                    <>
                      <RefreshCw className="w-3 h-3" aria-hidden="true" />
                      <span>{t.aiReanalyzeBtn}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3" aria-hidden="true" />
                      <span>{t.aiRunAnalysisBtn}</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Distinct Archive of Older AI Analyses (Before Newer Enriched Data) */}
            {showPreviousHistory && previousAnalyses.length > 0 && (
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/90 dark:border-zinc-800 space-y-3 text-xs">
                <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {isMy
                    ? 'ယခင်ဒေတာဖြင့် သုံးသပ်ခဲ့သော AI မှတ်တမ်းဟောင်းများ (ဒေတာအသစ်မတိုင်မီ)'
                    : 'Previous AI Analyses (Generated on Earlier Kalodata Data)'}
                </div>
                <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                  {previousAnalyses.map((prevItem, idx) => (
                    <div key={`${prevItem.dataFingerprint}-${idx}`} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                          {formatResearchDateTime(prevItem.analyzedAt, language)} ·{' '}
                          {t.confidenceLabels[prevItem.overallDataConfidence]}
                        </span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {t.aiVerdictLabels[prevItem.finalRecommendation.verdict]}
                        </span>
                      </div>
                      <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        {isMy
                          ? prevItem.finalRecommendation.headlineMy
                          : prevItem.finalRecommendation.headlineEn}
                      </p>
                      <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {isMy ? prevItem.whyChooseMy : prevItem.whyChooseEn}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
