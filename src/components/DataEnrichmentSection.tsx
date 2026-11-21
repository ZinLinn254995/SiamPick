import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Layers,
  Loader2,
  MessageSquareText,
  ShieldAlert,
  Store,
} from 'lucide-react';
import type {
  KalodataProductDetailEnrichmentRecord,
  KalodataReviewInsightData,
  KalodataReviewPoint,
  KalodataShopEnrichmentRecord,
  Language,
  ProductEnrichmentExecutionSummary,
  ResearchProduct,
} from '../types/product';
import { formatThb } from '../utils/format';
import { formatCredits, formatUsd } from '../utils/kalodataPricing';
import {
  getProductEnrichmentCoverage,
  mergeEnrichmentIntoProduct,
  planProductEnrichment,
  type EnrichmentSelection,
} from '../utils/enrichmentPlanner';
import {
  getCachedEnrichmentForProduct,
  saveEnrichmentToCache,
} from '../utils/enrichmentCache';
import { formatResearchDateTime } from '../utils/savedProductsStorage';
import { TRANSLATIONS } from '../i18n/translations';
import { InfoPopover } from './InfoPopover';

interface DataEnrichmentSectionProps {
  product: ResearchProduct;
  salesWeightPct: number;
  peerProducts?: readonly ResearchProduct[];
  spendingLimitCredits: number;
  language: Language;
  onProductEnriched?: (
    updatedProduct: ResearchProduct,
    shopDetail: KalodataShopEnrichmentRecord | null,
    summary: ProductEnrichmentExecutionSummary | null
  ) => void;
}

function formatNum(value: number | null | undefined, suffix = ''): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${Math.round(value).toLocaleString('en-US')}${suffix}`;
}

function formatMoney(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return formatThb(value);
}

function renderPointList(
  points: KalodataReviewPoint[],
  emptyLabel: string,
  isMy: boolean,
  markerClass: string
) {
  if (!points || points.length === 0) {
    return <p className="text-xs text-zinc-400">{emptyLabel}</p>;
  }
  return (
    <ul className={`space-y-1.5 text-xs text-zinc-700 leading-relaxed list-disc pl-4 ${markerClass}`}>
      {points.map((pt, idx) => (
        <li key={`${idx}-${pt.point}`}>
          <span>{pt.point}</span>{' '}
          <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
            ({isMy ? `${pt.mentions} ကြိမ်` : `${pt.mentions}x`})
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DataEnrichmentSection({
  product,
  salesWeightPct,
  peerProducts,
  spendingLimitCredits,
  language,
  onProductEnriched,
}: DataEnrichmentSectionProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const unavailableText = t.dataStatusLabels.unavailable;

  const coverage = useMemo(() => getProductEnrichmentCoverage(product), [product]);
  const cached = useMemo(() => getCachedEnrichmentForProduct(product), [product]);

  // Default selection: auto-select missing Product Detail & Shop Detail (low cost 0.1 cr each); Review Insights ALWAYS opt-in (false by default)
  const [selection, setSelection] = useState<EnrichmentSelection>(() => ({
    productDetail: !coverage.hasProductDetail,
    shopDetail: !coverage.hasShopDetail,
    reviewInsights: false,
  }));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      inFlightRef.current = false;
    };
  }, []);
  const [cacheWarning, setCacheWarning] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<ProductEnrichmentExecutionSummary | null>(null);

  // Reset controls cleanly when switching to a different product or after enrichment finishes
  useEffect(() => {
    setSelection({
      productDetail: !coverage.hasProductDetail,
      shopDetail: !coverage.hasShopDetail,
      reviewInsights: false,
    });
    setConfirmOpen(false);
    setErrorMsg(null);
  }, [
    product.id,
    coverage.hasProductDetail,
    coverage.hasShopDetail,
    coverage.hasReviewInsights,
  ]);

  useEffect(() => {
    setLastSummary(null);
    setCacheWarning(null);
  }, [product.id]);

  const plan = useMemo(
    () =>
      planProductEnrichment(product, selection, {
        spendingLimitCredits,
        cachedProductDetail: cached.productDetail,
        cachedShopDetail: cached.shopDetail,
        cachedReviewInsight: cached.reviewInsight,
      }),
    [product, selection, spendingLimitCredits, cached]
  );

  const allThreePresent =
    coverage.hasProductDetail && coverage.hasShopDetail && coverage.hasReviewInsights;

  const hasAnySelected =
    selection.productDetail || selection.shopDetail || selection.reviewInsights;

  const canApplyCacheOnly =
    hasAnySelected && plan.plannedApiCalls === 0 && plan.reusedFromCacheCount > 0;

  const handleApplyCacheOnly = () => {
    const merged = mergeEnrichmentIntoProduct(
      product,
      {
        productDetail:
          selection.productDetail && plan.layers.productDetail.action === 'reuse-cache'
            ? cached.productDetail
            : null,
        shopDetail:
          selection.shopDetail && plan.layers.shopDetail.action === 'reuse-cache'
            ? cached.shopDetail
            : null,
        reviewInsight:
          selection.reviewInsights && plan.layers.reviewInsights.action === 'reuse-cache'
            ? cached.reviewInsight
            : null,
      },
      { salesWeightPct, peerProducts }
    );

    if (merged.changed) {
      const cacheSummary: ProductEnrichmentExecutionSummary = {
        canonicalProductId: plan.canonicalProductId,
        shopId: plan.shopId,
        enrichedAt: new Date().toISOString(),
        plannedApiCalls: 0,
        actualApiCalls: 0,
        deduplicatedCallsSaved: plan.reusedFromCacheCount,
        estimatedCredits: 0,
        estimatedUsd: 0,
        actualCredits: 0,
        actualUsd: 0,
        balanceBefore: null,
        balanceAfter: null,
        layerResults: {
          productDetail:
            plan.layers.productDetail.action === 'reuse-cache'
              ? 'reused-cache'
              : plan.layers.productDetail.action === 'already-present'
                ? 'already-present'
                : 'skipped',
          shopDetail:
            plan.layers.shopDetail.action === 'reuse-cache'
              ? 'reused-cache'
              : plan.layers.shopDetail.action === 'already-present'
                ? 'already-present'
                : 'skipped',
          reviewInsights:
            plan.layers.reviewInsights.action === 'reuse-cache'
              ? 'reused-cache'
              : plan.layers.reviewInsights.action === 'already-present'
                ? 'already-present'
                : 'skipped',
        },
      };
      setLastSummary(cacheSummary);
      onProductEnriched?.(
        merged.product,
        plan.layers.shopDetail.action === 'reuse-cache' ? cached.shopDetail : null,
        cacheSummary
      );
    }
  };

  const handleConfirmEnrich = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 45_000);

    setConfirmOpen(false);
    setErrorMsg(null);
    setCacheWarning(null);
    setIsEnriching(true);

    try {
      const response = await fetch('/api/enrich-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          product,
          requestedLayers: selection,
          spendingLimitCredits,
          salesWeightPct,
          peerProducts: peerProducts?.slice(0, 40),
          clientCachedProductDetail: cached.productDetail,
          clientCachedShopDetail: cached.shopDetail,
          clientCachedReviewInsight: cached.reviewInsight,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        product?: ResearchProduct;
        changed?: boolean;
        productDetail?: KalodataProductDetailEnrichmentRecord | null;
        shopDetail?: KalodataShopEnrichmentRecord | null;
        reviewInsight?: KalodataReviewInsightData | null;
        summary?: ProductEnrichmentExecutionSummary;
        error?: string;
        errorMy?: string;
      } | null;

      if (abortRef.current !== controller) return;

      if (!response.ok || !payload?.ok || !payload.product) {
        setErrorMsg(
          isMy
            ? (payload?.errorMy ?? payload?.error ?? `Enrichment failed (HTTP ${response.status})`)
            : (payload?.error ?? `Enrichment failed (HTTP ${response.status})`)
        );
        return;
      }

      // Persist newly fetched Product/Shop/Review enrichment in dedicated localStorage cache
      const cacheRes = saveEnrichmentToCache({
        productDetail: payload.productDetail ?? null,
        shopDetail: payload.shopDetail ?? null,
        reviewInsight: payload.reviewInsight ?? null,
      });
      if (!cacheRes.ok) {
        setCacheWarning(isMy ? (cacheRes.errorMy ?? cacheRes.errorEn ?? null) : (cacheRes.errorEn ?? null));
      }

      const summary = payload.summary ?? null;
      setLastSummary(summary);
      onProductEnriched?.(payload.product, payload.shopDetail ?? null, summary);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (timedOut) {
          setErrorMsg(
            isMy
              ? 'Kalodata ဒေတာဖြည့်စွက်မှု အချိန်ကျော်လွန်သွားပါသည် (45s Timeout)။ ထပ်မံစမ်းသပ်ပါ။'
              : 'Data enrichment request timed out after 45 seconds. Please try again.'
          );
        }
        return;
      }
      const msg = err instanceof Error ? err.message : 'Network error during enrichment.';
      setErrorMsg(msg);
    } finally {
      window.clearTimeout(timeoutId);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      inFlightRef.current = false;
      setIsEnriching(false);
    }
  };

  const m = product.kalodataMetrics;
  const ri = m?.reviewInsight ?? null;

  const priceRangeDisplay =
    typeof m?.minPriceThb === 'number' &&
    typeof m?.maxPriceThb === 'number' &&
    m.minPriceThb > 0 &&
    m.maxPriceThb > 0
      ? m.minPriceThb === m.maxPriceThb
        ? formatThb(m.minPriceThb)
        : `${formatThb(m.minPriceThb)} – ${formatThb(m.maxPriceThb)}`
      : null;

  const categoryPath = [
    m?.priCategory?.category_name,
    m?.secCategory?.category_name,
    m?.terCategory?.category_name,
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(' › ');

  const shopAffSharePct =
    typeof m?.shopRevenueThb === 'number' &&
    m.shopRevenueThb > 0 &&
    typeof m?.shopAffiliateRevenueThb === 'number'
      ? `${((m.shopAffiliateRevenueThb / m.shopRevenueThb) * 100).toFixed(1)}%`
      : null;

  const lastUpdatedIso = m?.lastEnrichedAt ?? product.researchedAt ?? null;
  const verificationCount = [
    coverage.hasProductDetail,
    coverage.hasShopDetail,
    coverage.hasReviewInsights,
  ].filter(Boolean).length;

  const marketDetailRows: { label: string; value: string | null }[] = [
    {
      label: isMy ? 'ရောင်းအား (Sales Volume)' : 'Product Sales',
      value: formatNum(m?.salesVolume, isMy ? ' ခု' : ' units'),
    },
    {
      label: isMy ? 'ဝင်ငွေ (Revenue)' : 'Product Revenue',
      value: formatMoney(m?.revenueThb),
    },
    {
      label: isMy ? 'ရောင်းအားတိုးနှုန်း (Sales Growth)' : 'Sales / Revenue Growth',
      value:
        typeof m?.revenueGrowthRate === 'number'
          ? `${m.revenueGrowthRate >= 0 ? '+' : ''}${m.revenueGrowthRate.toFixed(1)}%`
          : null,
    },
    {
      label: isMy ? 'ဈေးနှုန်းနှင့် ဈေးအပိုင်းအခြား' : 'Unit Price & Range',
      value:
        product.priceThb && product.priceThb > 0
          ? priceRangeDisplay && priceRangeDisplay !== formatThb(product.priceThb)
            ? `${formatThb(product.priceThb)} (${priceRangeDisplay})`
            : formatThb(product.priceThb)
          : priceRangeDisplay,
    },
    {
      label: isMy ? 'Affiliate Commission' : 'Affiliate Commission',
      value:
        product.commissionVerified && product.commissionRate !== null
          ? `${product.commissionRate}%${product.estimatedCommissionPerSaleThb ? ` (~${formatThb(product.estimatedCommissionPerSaleThb)})` : ''}`
          : null,
    },
    {
      label: isMy ? 'Creator အရေအတွက်' : 'Creator Count',
      value: formatNum(m?.creatorNumber, isMy ? ' ဦး' : ' creators'),
    },
    {
      label: isMy ? 'Review အရေအတွက် / Rating' : 'Reviews & Rating',
      value:
        product.reviewCount || product.customerRating
          ? [
              product.customerRating ? `${product.customerRating.toFixed(1)}/5.0` : null,
              product.reviewCount
                ? `${product.reviewCount.toLocaleString('en-US')} ${isMy ? 'ခု' : 'reviews'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : null,
    },
    {
      label: isMy ? 'Video / Live Content စွမ်းဆောင်ရည်' : 'Video / Live Performance',
      value:
        m?.videoRevenueThb !== null && m?.videoRevenueThb !== undefined
          ? `Video ${formatThb(m.videoRevenueThb)}${m.videoNumber !== null && m.videoNumber !== undefined ? ` (${m.videoNumber})` : ''} · Live ${m.liveRevenueThb !== null && m.liveRevenueThb !== undefined ? formatThb(m.liveRevenueThb) : '—'}`
          : null,
    },
    {
      label: isMy ? 'Category အသေးစိတ်' : 'Category Hierarchy',
      value: categoryPath || product.subCategory || null,
    },
    {
      label: isMy ? 'SKU / Launch / Delivery' : 'SKU / Launch / Delivery',
      value:
        [
          m?.skuCount ? `${m.skuCount} SKUs` : null,
          m?.launchDate ? m.launchDate : null,
          m?.deliveryType ? m.deliveryType : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
    },
  ];

  const shopInfoRows: { label: string; value: string | null }[] = [
    {
      label: isMy ? 'ဆိုင်အမည် (Shop Name)' : 'Shop Name',
      value: m?.sellerName ?? (product.shopName !== 'Unavailable' ? product.shopName : null),
    },
    {
      label: isMy ? 'ဆိုင်အမျိုးအစား (Brand / Retailer)' : 'Shop Type (Brand / Retailer)',
      value: m?.shopSellerType ?? null,
    },
    {
      label: isMy ? 'ဆိုင်စုစုပေါင်း GMV' : 'Shop GMV (30d)',
      value: formatMoney(m?.shopRevenueThb),
    },
    {
      label: isMy ? 'Affiliate GMV နှင့် အချိုး' : 'Affiliate GMV & Share',
      value:
        m?.shopAffiliateRevenueThb !== null && m?.shopAffiliateRevenueThb !== undefined
          ? `${formatThb(m.shopAffiliateRevenueThb)}${shopAffSharePct ? ` (${shopAffSharePct})` : ''}`
          : null,
    },
    {
      label: isMy ? 'Shop Creator အရေအတွက်' : 'Shop Creator Count',
      value: formatNum(m?.shopCreatorNumber, isMy ? ' ဦး' : ' creators'),
    },
    {
      label: isMy ? 'ဆိုင်စွမ်းဆောင်ရည် (Self / Mall / Products)' : 'Shop Performance Details',
      value:
        [
          m?.shopProductNumber ? `${m.shopProductNumber} ${isMy ? 'ပစ္စည်း' : 'products'}` : null,
          m?.shopSalesVolume ? `${Math.round(m.shopSalesVolume).toLocaleString('en-US')} ${isMy ? 'ခုရောင်း' : 'sales'}` : null,
          m?.shopSelfAccountRevenueThb !== null && m?.shopSelfAccountRevenueThb !== undefined
            ? `Self ${formatThb(m.shopSelfAccountRevenueThb)}`
            : null,
          m?.shopShoppingMallRevenueThb !== null && m?.shopShoppingMallRevenueThb !== undefined
            ? `Mall ${formatThb(m.shopShoppingMallRevenueThb)}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
    },
  ];

  return (
    <section
      id="rep-enrichment"
      className="scroll-mt-4 pt-6 border-t border-zinc-200 space-y-5"
    >
      {/* Header with Verification Status & Last Updated */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-zinc-900 shrink-0" aria-hidden="true" />
          <h3 className="font-display text-sm font-semibold text-zinc-950">
            {t.enrichSectionHeading}
          </h3>
          <InfoPopover
            variant="info"
            label={t.enrichSectionHeading}
            title={t.enrichSectionHeading}
            content={t.enrichSectionSubtitle}
          />
        </div>

        <div className="text-[11px] font-mono text-zinc-500 tabular-nums shrink-0 text-left sm:text-right">
          <div>
            {t.enrichVerificationLabel}:{' '}
            <strong className={verificationCount >= 2 ? 'text-emerald-700' : 'text-zinc-800'}>
              {verificationCount}/3 {isMy ? 'အဆင့် ဖြည့်ပြီး' : 'layers enriched'}
            </strong>
          </div>
          <div>
            {t.enrichLastUpdatedLabel}:{' '}
            {lastUpdatedIso ? formatResearchDateTime(lastUpdatedIso, language) : t.enrichNotEnrichedYet}
          </div>
        </div>
      </div>

      {/* Selective Enrichment Control Panel (Zero Duplicate Calls + Cost Preview + Confirmation Gate) */}
      <div className="p-4 rounded-xl bg-zinc-50/90 border border-zinc-200/90 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-900">{t.enrichControlsHeading}</span>
            <InfoPopover
              variant="help"
              label={t.enrichControlsHeading}
              title={t.enrichControlsHeading}
              content={
                <div className="space-y-1.5">
                  <p>{t.enrichShopCacheSavedNote}</p>
                  {!coverage.hasReviewInsights && (
                    <p className="text-amber-800">{t.enrichReviewOptInWarning}</p>
                  )}
                </div>
              }
            />
          </div>
          <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
            {t.spendingLimitLabel}: {formatCredits(spendingLimitCredits)} {t.creditsUnit}
          </span>
        </div>

        {!coverage.hasKalodataId ? (
          <p className="text-xs text-zinc-500">{t.enrichNoKalodataIdNotice}</p>
        ) : allThreePresent ? (
          <div className="flex items-center gap-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t.enrichAllDoneNotice}</span>
          </div>
        ) : (
          <>
            {/* 3 Selective Layer Checkboxes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(
                [
                  {
                    key: 'productDetail' as const,
                    label: t.enrichLayerProductDetail,
                    present: coverage.hasProductDetail,
                    cachedAvailable: Boolean(cached.productDetail),
                    costLabel: '0.1 cr',
                  },
                  {
                    key: 'shopDetail' as const,
                    label: t.enrichLayerShopDetail,
                    present: coverage.hasShopDetail,
                    cachedAvailable: Boolean(cached.shopDetail),
                    costLabel: '0.1 cr',
                  },
                  {
                    key: 'reviewInsights' as const,
                    label: t.enrichLayerReviewInsights,
                    present: coverage.hasReviewInsights,
                    cachedAvailable: Boolean(cached.reviewInsight),
                    costLabel: '1.0 cr',
                  },
                ]
              ).map((item) => {
                const disabled = item.present || isEnriching;
                const checked = item.present ? false : selection[item.key];
                const statusText = item.present
                  ? t.enrichStatusPresent
                  : item.cachedAvailable
                    ? t.enrichStatusCached
                    : `${item.costLabel} · ${t.enrichStatusMissing}`;

                return (
                  <label
                    key={item.key}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs transition-colors ${
                      item.present
                        ? 'bg-emerald-50/40 border-emerald-200/70 text-zinc-600 cursor-default'
                        : checked
                          ? 'bg-white border-zinc-900 text-zinc-950 cursor-pointer'
                          : 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-400 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => {
                        setConfirmOpen(false);
                        setSelection((prev) => ({ ...prev, [item.key]: e.target.checked }));
                      }}
                      className="mt-0.5 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950"
                    />
                    <div className="min-w-0">
                      <div className="font-medium leading-tight">{item.label}</div>
                      <div
                        className={`mt-0.5 font-mono text-[11px] tabular-nums ${
                          item.present
                            ? 'text-emerald-700'
                            : item.cachedAvailable
                              ? 'text-emerald-700 font-medium'
                              : item.key === 'reviewInsights'
                                ? 'text-amber-700'
                                : 'text-zinc-500'
                        }`}
                      >
                        {statusText}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Live Cost & Deduplication Summary Row */}
            {hasAnySelected && (
              <div className="pt-2.5 border-t border-zinc-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="font-mono text-[11px] text-zinc-700 tabular-nums space-x-3">
                  <span>
                    {t.plannedCallsLabel}: <strong className="text-zinc-950">{plan.plannedApiCalls}</strong>
                  </span>
                  <span>
                    {t.estimatedCostLabel}:{' '}
                    <strong className={plan.exceedsSpendingLimit ? 'text-red-700' : 'text-zinc-950'}>
                      {formatCredits(plan.estimatedCredits)} {t.creditsUnit}
                    </strong>{' '}
                    (≈ {formatUsd(plan.estimatedUsd)})
                  </span>
                  {plan.reusedFromCacheCount > 0 && (
                    <span className="font-sans text-emerald-700 font-medium">
                      · {plan.reusedFromCacheCount} {t.enrichDedupSavedLabel}
                    </span>
                  )}
                </div>

                {!confirmOpen && !isEnriching && (
                  <div>
                    {canApplyCacheOnly ? (
                      <button
                        type="button"
                        onClick={handleApplyCacheOnly}
                        className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer"
                      >
                        <Database className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t.enrichApplyCacheBtn}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={plan.exceedsSpendingLimit || plan.plannedApiCalls === 0}
                        onClick={() => setConfirmOpen(true)}
                        className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-zinc-950 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t.enrichStartBtn}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Spending Limit Exceeded Warning */}
            {plan.exceedsSpendingLimit && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{t.enrichSpendingLimitBlocked}</span>
              </div>
            )}

            {/* Explicit Pre-Call Confirmation Gate */}
            {confirmOpen && !isEnriching && !plan.exceedsSpendingLimit && (
              <div className="p-3.5 rounded-lg bg-white border border-zinc-300 space-y-2.5 text-xs">
                <div>
                  <div className="font-semibold text-zinc-950">{t.enrichConfirmTitle}</div>
                  <p className="mt-0.5 text-zinc-600 leading-relaxed">{t.enrichConfirmDesc}</p>
                </div>
                <ul className="space-y-1 text-zinc-700 list-disc pl-4 marker:text-zinc-400">
                  {(['productDetail', 'shopDetail', 'reviewInsights'] as const)
                    .filter((key) => plan.layers[key].requested)
                    .map((key) => (
                      <li key={key}>
                        {isMy ? plan.layers[key].reasonMy : plan.layers[key].reasonEn}
                      </li>
                    ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleConfirmEnrich}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-4 py-1.5 text-xs font-medium text-white bg-zinc-950 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <span>
                      {t.enrichConfirmProceedBtn} ({formatCredits(plan.estimatedCredits)} {t.creditsUnit})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className="inline-flex items-center min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:border-zinc-400 rounded-lg transition-colors cursor-pointer"
                  >
                    {t.enrichConfirmCancelBtn}
                  </button>
                </div>
              </div>
            )}

            {/* Enriching Spinner */}
            {isEnriching && (
              <div className="p-3 rounded-lg bg-white border border-zinc-200 flex items-center gap-2.5 text-xs text-zinc-700">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-900 shrink-0" aria-hidden="true" />
                <span>{t.enrichRunningLabel}</span>
              </div>
            )}
          </>
        )}

        {/* Execution Summary Banner */}
        {lastSummary && (
          <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
              <span className="font-sans font-semibold">
                {isMy ? 'ဒေတာဖြည့်စွက်မှု ပြီးစီးပါပြီ' : 'Enrichment completed'}
              </span>
              <span>
                {lastSummary.actualApiCalls} {t.actualCallsLabel} ·{' '}
                {lastSummary.actualCredits !== null
                  ? `${formatCredits(lastSummary.actualCredits)} ${t.creditsUnit}`
                  : `${formatCredits(lastSummary.estimatedCredits)} ${t.creditsUnit} (est)`}
                {lastSummary.deduplicatedCallsSaved > 0
                  ? ` · ${lastSummary.deduplicatedCallsSaved} ${t.enrichDedupSavedLabel}`
                  : ''}
              </span>
            </div>
            {lastSummary.layerErrors && (
              <ul className="space-y-0.5 text-amber-900 text-[11px] pt-1">
                {Object.entries(lastSummary.layerErrors).map(([k, err]) =>
                  err ? <li key={k}>• {isMy ? err.my : err.en}</li> : null
                )}
              </ul>
            )}
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900"
          >
            {errorMsg}
          </div>
        )}

        {cacheWarning && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
            {cacheWarning}
          </div>
        )}
      </div>

      {/* Block 1: Kalodata Market Data & Product Detail */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-zinc-700" aria-hidden="true" />
            <h4 className="font-display text-xs font-semibold text-zinc-950">
              {t.enrichMarketProductHeading}
            </h4>
          </div>
          <span
            className={`text-[11px] font-medium ${coverage.hasProductDetail ? 'text-emerald-700' : 'text-zinc-500'}`}
          >
            {coverage.hasProductDetail ? t.dataStatusLabels.verified : t.enrichNotEnrichedYet}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 border-y border-zinc-200/80 divide-y divide-zinc-100 sm:divide-y-0">
          {marketDetailRows.map((row) => (
            <div
              key={row.label}
              className="py-2 sm:border-b sm:border-zinc-100 flex items-baseline justify-between gap-3 text-xs"
            >
              <span className="text-zinc-500 shrink-0">{row.label}</span>
              <span
                className={`text-right truncate ${
                  row.value
                    ? 'font-mono text-zinc-950 tabular-nums font-medium'
                    : 'text-zinc-400'
                }`}
              >
                {row.value ?? unavailableText}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Block 2: Shop Information */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-zinc-700" aria-hidden="true" />
            <h4 className="font-display text-xs font-semibold text-zinc-950">
              {t.enrichShopInfoHeading}
            </h4>
            {!coverage.hasShopDetail && (
              <InfoPopover
                variant="info"
                label={t.enrichShopInfoHeading}
                title={t.enrichShopInfoHeading}
                content={t.enrichShopUnavailableNote}
              />
            )}
          </div>
          <span
            className={`text-[11px] font-medium ${coverage.hasShopDetail ? 'text-emerald-700' : 'text-zinc-400'}`}
          >
            {coverage.hasShopDetail ? t.dataStatusLabels.verified : unavailableText}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 border-y border-zinc-200/80 divide-y divide-zinc-100 sm:divide-y-0">
          {shopInfoRows.map((row) => (
            <div
              key={row.label}
              className="py-2 sm:border-b sm:border-zinc-100 flex items-baseline justify-between gap-3 text-xs"
            >
              <span className="text-zinc-500 shrink-0">{row.label}</span>
              <span
                className={`text-right truncate ${
                  row.value
                    ? 'font-mono text-zinc-950 tabular-nums font-medium'
                    : 'text-zinc-400'
                }`}
              >
                {row.value ?? unavailableText}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Block 3: Customer & Review Insights (5 Structured Dimensions — Never Fabricated) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <MessageSquareText className="w-3.5 h-3.5 text-zinc-700" aria-hidden="true" />
            <h4 className="font-display text-xs font-semibold text-zinc-950">
              {t.enrichReviewInsightsHeading}
            </h4>
            {!coverage.hasReviewInsights && (
              <InfoPopover
                variant="info"
                label={t.enrichReviewInsightsHeading}
                title={t.enrichReviewInsightsHeading}
                content={t.enrichReviewUnavailableNote}
              />
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            {ri && ri.commentsAnalyzed > 0 && (
              <span className="font-mono text-zinc-500 tabular-nums">
                {ri.commentsAnalyzed} {isMy ? 'မှတ်ချက်' : 'comments'}
                {ri.averageRating ? ` · ${ri.averageRating.toFixed(1)}/5` : ''}
              </span>
            )}
            <span
              className={`font-medium ${coverage.hasReviewInsights ? 'text-emerald-700' : 'text-zinc-400'}`}
            >
              {coverage.hasReviewInsights ? t.dataStatusLabels.verified : unavailableText}
            </span>
          </div>
        </div>

        {coverage.hasReviewInsights && ri && (
          <div className="space-y-3">
            {ri.summary && (
              <p className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-700 leading-relaxed">
                {ri.summary}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="p-3.5 rounded-xl bg-white border border-zinc-200/90 space-y-2">
                <h5 className="text-xs font-semibold text-emerald-800">{t.enrichReviewLikes}</h5>
                {renderPointList(ri.positivePoints, unavailableText, isMy, 'marker:text-emerald-600')}
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-zinc-200/90 space-y-2">
                <h5 className="text-xs font-semibold text-zinc-900">{t.enrichReviewDislikes}</h5>
                {renderPointList(ri.painPoints, unavailableText, isMy, 'marker:text-zinc-400')}
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-zinc-200/90 space-y-2">
                <h5 className="text-xs font-semibold text-amber-800">{t.enrichReviewComplaints}</h5>
                {renderPointList(ri.frequentComplaints, unavailableText, isMy, 'marker:text-amber-600')}
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-zinc-200/90 space-y-2">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
                  <h5 className="text-xs font-semibold text-zinc-900">
                    {t.enrichReviewQualityCautions}
                  </h5>
                </div>
                {renderPointList(ri.qualityCautions, unavailableText, isMy, 'marker:text-amber-600')}
              </div>

              <div className="md:col-span-2 p-3.5 rounded-xl bg-white border border-zinc-200/90 space-y-2">
                <h5 className="text-xs font-semibold text-zinc-900">{t.enrichReviewBuyerNeeds}</h5>
                {renderPointList(ri.buyerNeeds, unavailableText, isMy, 'marker:text-zinc-500')}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
