import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  HelpCircle,
  ImageOff,
  Layers,
  ShieldCheck,
  Star,
  Store,
  X,
} from 'lucide-react';
import type {
  DataStatus,
  Language,
  ResearchProduct,
} from '../types/product';
import {
  deriveImportedProductOverview,
  type ImportedWorkspaceContext,
} from '../utils/importedProductWorkspace';
import { formatThb, isSafeHttpUrl } from '../utils/format';
import { formatCredits } from '../utils/kalodataPricing';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';

interface ImportedProductWorkspaceProps {
  context: ImportedWorkspaceContext;
  language: Language;
  salesWeightPct: number;
  peerProducts?: readonly ResearchProduct[];
  isSaved: boolean;
  isInResults: boolean;
  deepDiveRunsCount: number;
  onToggleSave: (product: ResearchProduct) => void;
  onOpenDeepDive: (product: ResearchProduct) => void;
  onOpenReport: (product: ResearchProduct) => void;
  onScrollToResults?: (productId: string) => void;
  onClose: () => void;
}

function getStatusColorClass(status: DataStatus): string {
  if (status === 'verified') return 'text-emerald-700 dark:text-emerald-400';
  if (status === 'estimated') return 'text-amber-700 dark:text-amber-400';
  if (status === 'unverified') return 'text-zinc-600 dark:text-zinc-300';
  return 'text-zinc-500 dark:text-zinc-400';
}

function StatusIcon({ status }: { status: DataStatus }) {
  if (status === 'verified') {
    return (
      <CheckCircle2
        className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (status === 'estimated') {
    return (
      <AlertTriangle
        className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0"
        aria-hidden="true"
      />
    );
  }
  if (status === 'unverified') {
    return (
      <HelpCircle
        className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0"
        aria-hidden="true"
      />
    );
  }
  return (
    <AlertCircle
      className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0"
      aria-hidden="true"
    />
  );
}

export function ImportedProductWorkspace({
  context,
  language,
  salesWeightPct,
  peerProducts,
  isSaved,
  isInResults,
  deepDiveRunsCount,
  onToggleSave,
  onOpenDeepDive,
  onOpenReport,
  onScrollToResults,
  onClose,
}: ImportedProductWorkspaceProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const overview = useMemo(
    () =>
      deriveImportedProductOverview(context, {
        salesWeightPct,
        peerProducts,
      }),
    [context, salesWeightPct, peerProducts]
  );

  const product = context.product;
  const displayName = isMy ? overview.productNameMy : overview.productName;
  const categoryLabel = isMy ? overview.categoryLabelMy : overview.categoryLabelEn;
  const subCategory = isMy ? overview.subCategoryMy : overview.subCategory;
  const sourceTitle = isMy ? overview.sourceTitleMy : overview.sourceTitleEn;
  const sourceDetail = isMy ? overview.sourceDetailMy : overview.sourceDetailEn;
  const unavailableItems = isMy ? overview.unavailableItemsMy : overview.unavailableItemsEn;

  const channelParts: string[] = [];
  if (overview.videoRevenueThb !== null) {
    channelParts.push(`Video ${formatThb(overview.videoRevenueThb)}`);
  }
  if (overview.liveRevenueThb !== null) {
    channelParts.push(`Live ${formatThb(overview.liveRevenueThb)}`);
  }
  if (overview.shoppingMallRevenueThb !== null) {
    channelParts.push(`Mall ${formatThb(overview.shoppingMallRevenueThb)}`);
  } else if (overview.showcaseRevenueThb !== null) {
    channelParts.push(`Showcase ${formatThb(overview.showcaseRevenueThb)}`);
  }

  const handleCopyProductId = async () => {
    const idText = overview.numericProductId ?? overview.canonicalProductId;
    try {
      await navigator.clipboard.writeText(idText);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 1600);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleCopyTikTokUrl = async () => {
    if (!overview.tiktokShopUrl) return;
    try {
      await navigator.clipboard.writeText(overview.tiktokShopUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1600);
    } catch {
      // Ignore clipboard failures
    }
  };

  const growthFormatted =
    overview.revenueGrowthRate !== null
      ? `${overview.revenueGrowthRate >= 0 ? '+' : ''}${overview.revenueGrowthRate.toFixed(1)}%`
      : null;

  return (
    <section
      aria-labelledby="imported-workspace-heading"
      className="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-2xl overflow-hidden transition-colors"
    >
      {/* Top Workspace Header Bar */}
      <div className="px-4 sm:px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2
              id="imported-workspace-heading"
              className="font-display text-base sm:text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50"
            >
              {t.importedWorkspaceHeading}
            </h2>
            <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <Database className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
              <span>{sourceTitle}</span>
              <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                ({formatCredits(overview.estimatedCreditsCharged)} cr)
              </span>
            </span>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {t.importedWorkspaceSubtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={t.importedWorkspaceCloseBtn}
          className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t.importedWorkspaceCloseBtn}</span>
        </button>
      </div>

      {/* Main Product Overview Header: Image + Identity + Shop + Primary Deep Dive Action */}
      <div className="p-4 sm:p-6">
        <div className="flex flex-col md:flex-row items-start gap-5">
          {/* Product Image */}
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 shrink-0">
            {overview.imageConfig.canRender && overview.imageConfig.src ? (
              <ProductImage
                src={overview.imageConfig.src}
                fallbackSrc={overview.imageConfig.fallbackSrc}
                productId={overview.imageConfig.productId}
                alt={overview.productName}
                title={displayName}
                unavailableLabel={t.cardImageUnverified}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
                <ImageOff
                  className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mb-1.5"
                  aria-hidden="true"
                />
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {t.cardImageUnverified}
                </span>
              </div>
            )}
          </div>

          {/* Product Core Identity, Shop, ID, Links & Actions */}
          <div className="min-w-0 flex-1 space-y-3 w-full">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{categoryLabel}</span>
                {subCategory && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{subCategory}</span>
                  </>
                )}
                {overview.dateRange && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{overview.dateRange}</span>
                  </>
                )}
              </div>

              <h3 className="font-display text-lg sm:text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 leading-snug text-balance">
                {displayName}
              </h3>

              {/* Shop + Product ID Metadata Line */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5 text-xs text-zinc-700 dark:text-zinc-300">
                <span className="inline-flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {t.importedWorkspaceShopLabel}:
                  </span>
                  <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                    {overview.shopAvailable ? overview.shopName : t.dataStatusLabels.unavailable}
                  </strong>
                  {overview.shopSellerType && (
                    <span className="text-zinc-500 dark:text-zinc-400">
                      ({overview.shopSellerType})
                    </span>
                  )}
                </span>

                {overview.sellerId && (
                  <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {t.importedWorkspaceSellerIdLabel}: {overview.sellerId}
                  </span>
                )}

                <span className="text-zinc-500 dark:text-zinc-400">
                  {t.importedWorkspaceDispatchLabel}:{' '}
                  <span className="text-zinc-800 dark:text-zinc-200">{overview.dispatchHub}</span>
                </span>
              </div>

              {/* Product ID & TikTok Shop Links Row */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5 text-xs">
                <div className="inline-flex items-center gap-1.5">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {t.importedWorkspaceProductIdLabel}:
                  </span>
                  <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                    {overview.numericProductId ?? overview.canonicalProductId}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyProductId()}
                    aria-label={t.importedWorkspaceCopyLinkBtn}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    {copiedId ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                        <span>{t.importedWorkspaceCopiedBtn}</span>
                      </>
                    ) : (
                      <Copy className="w-3 h-3" aria-hidden="true" />
                    )}
                  </button>
                </div>

                {overview.tiktokShopUrl && (
                  <div className="inline-flex items-center gap-2">
                    <a
                      href={overview.tiktokShopUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white hover:underline whitespace-nowrap"
                    >
                      <span>{t.importedWorkspaceOpenTikTokBtn}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleCopyTikTokUrl()}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {copiedLink ? (
                        <Check className="w-3 h-3 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                      ) : (
                        <Copy className="w-3 h-3" aria-hidden="true" />
                      )}
                      <span>
                        {copiedLink ? t.importedWorkspaceCopiedBtn : t.importedWorkspaceCopyLinkBtn}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Primary Action: Enter Deep Dive Analysis + Secondary Workspace Actions */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenDeepDive(product)}
                    className="inline-flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Layers className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{t.importedWorkspaceDeepDiveCta}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleSave(product)}
                    aria-pressed={isSaved}
                    className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-xl border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      isSaved
                        ? 'bg-emerald-700 dark:bg-emerald-600 text-white border-emerald-700 dark:border-emerald-600 hover:bg-emerald-800 dark:hover:bg-emerald-500'
                        : 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
                    }`}
                  >
                    <Bookmark
                      className={`w-3.5 h-3.5 shrink-0 ${isSaved ? 'fill-current' : ''}`}
                      aria-hidden="true"
                    />
                    <span>{isSaved ? t.btnSavedProduct : t.btnSaveProduct}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenReport(product)}
                    className="inline-flex items-center justify-center gap-1 min-h-[40px] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>{t.linkImportOpenReportBtn}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  </button>

                  {isInResults && onScrollToResults && (
                    <button
                      type="button"
                      onClick={() => onScrollToResults(product.id)}
                      className="inline-flex items-center justify-center min-h-[40px] px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {t.linkImportScrollToProductBtn}
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {t.importedWorkspaceDeepDiveHint}
                  {deepDiveRunsCount > 0 && (
                    <span className="font-mono text-zinc-700 dark:text-zinc-300 ml-2 tabular-nums">
                      · {t.importedWorkspaceDeepDiveRunsLabel}: {deepDiveRunsCount}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Key Available Metrics Strip (Price, Sales, Revenue, Commission, Score, Creators/Reviews) */}
        <div className="mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-800/80 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* 1. Price */}
          <div className="min-w-0 space-y-1">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{t.cardPrice}</div>
            <div className="font-mono text-base font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
              {overview.priceThb !== null
                ? formatThb(overview.priceThb)
                : t.dataStatusLabels.unavailable}
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
              {overview.minPriceThb !== null &&
              overview.maxPriceThb !== null &&
              overview.minPriceThb !== overview.maxPriceThb ? (
                <span className="font-mono tabular-nums">
                  {formatThb(overview.minPriceThb)}–{formatThb(overview.maxPriceThb)}
                  {overview.skuCount ? ` · ${overview.skuCount} SKUs` : ''}
                </span>
              ) : overview.skuCount ? (
                <span className="font-mono tabular-nums">{overview.skuCount} SKUs</span>
              ) : (
                <span className={getStatusColorClass(overview.priceStatus)}>
                  {t.dataStatusLabels[overview.priceStatus]}
                </span>
              )}
            </div>
          </div>

          {/* 2. Sales Volume */}
          <div className="min-w-0 space-y-1">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {t.importedWorkspaceSalesLabel}
            </div>
            <div className="font-mono text-base font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
              {overview.salesVolume !== null
                ? overview.salesVolume.toLocaleString('en-US')
                : t.dataStatusLabels.unavailable}
            </div>
            <div className="text-[11px] leading-snug">
              <span className={getStatusColorClass(overview.salesStatus)}>
                {overview.salesVolume !== null
                  ? t.demandLabels[product.demandLevel]
                  : t.dataStatusLabels[overview.salesStatus]}
              </span>
            </div>
          </div>

          {/* 3. Revenue (GMV) & Growth */}
          <div className="min-w-0 space-y-1">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {t.importedWorkspaceRevenueLabel}
            </div>
            <div className="font-mono text-base font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
              {overview.revenueThb !== null
                ? formatThb(overview.revenueThb)
                : t.dataStatusLabels.unavailable}
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
              {growthFormatted ? (
                <span
                  className={`font-mono tabular-nums ${
                    (overview.revenueGrowthRate ?? 0) >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {growthFormatted}
                </span>
              ) : (
                <span className={getStatusColorClass(overview.salesStatus)}>
                  {t.dataStatusLabels[overview.salesStatus]}
                </span>
              )}
            </div>
          </div>

          {/* 4. Affiliate Commission */}
          <div className="min-w-0 space-y-1">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {t.importedWorkspaceCommissionLabel}
            </div>
            <div
              className={`font-mono text-base font-semibold tabular-nums ${
                overview.commissionRate !== null
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {overview.commissionRate !== null
                ? `${overview.commissionRate}%`
                : t.dataStatusLabels.unavailable}
            </div>
            <div className="text-[11px] leading-snug">
              {overview.estimatedCommissionPerSaleThb !== null ? (
                <span className="font-mono text-zinc-600 dark:text-zinc-300 tabular-nums">
                  {formatThb(overview.estimatedCommissionPerSaleThb)} {t.perOrder}
                </span>
              ) : (
                <span className={getStatusColorClass(overview.commissionStatus)}>
                  {t.dataStatusLabels[overview.commissionStatus]}
                </span>
              )}
            </div>
          </div>

          {/* 5. 7-Factor Score & Confidence */}
          <div className="min-w-0 space-y-1">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {t.importedWorkspaceScoreLabel}
            </div>
            <div className="font-mono text-base font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
              {overview.opportunityScore}
              <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">/100</span>
            </div>
            <div className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-snug">
              <span>{t.confidenceLabels[overview.confidenceLevel]}</span>{' '}
              <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                ({overview.verifiedCount}/{overview.totalCriteria})
              </span>
            </div>
          </div>

          {/* 6. Creators & Reviews */}
          <div className="min-w-0 space-y-1">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {t.importedWorkspaceCreatorsLabel}
            </div>
            <div className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
              {overview.creatorNumber !== null
                ? `${overview.creatorNumber.toLocaleString('en-US')} cr`
                : t.dataStatusLabels.unavailable}
              {overview.videoNumber !== null
                ? ` · ${overview.videoNumber.toLocaleString('en-US')} vid`
                : ''}
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug font-mono tabular-nums">
              {overview.customerRating !== null ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-500 fill-amber-500" aria-hidden="true" />
                  <span>{overview.customerRating.toFixed(1)}</span>
                  {overview.reviewCount !== null && (
                    <span>({overview.reviewCount.toLocaleString('en-US')})</span>
                  )}
                </span>
              ) : overview.reviewCount !== null ? (
                <span>{overview.reviewCount.toLocaleString('en-US')} reviews</span>
              ) : (
                <span className="font-sans text-zinc-400 dark:text-zinc-500">
                  {t.importedWorkspaceReviewsLabel}: {t.dataStatusLabels.unavailable}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Channel Split Row (only if available) */}
        {channelParts.length > 0 && (
          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-medium text-zinc-600 dark:text-zinc-400">
              {t.importedWorkspaceChannelSplitLabel}:
            </span>
            <span className="font-mono text-zinc-800 dark:text-zinc-200 tabular-nums">
              {channelParts.join(' · ')}
            </span>
          </div>
        )}

        {/* Provenance: Data Source, Field Verification Status, and Unavailable Data */}
        <div className="mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-800/80 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Data Source & Field Verification Status */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                <ShieldCheck
                  className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0"
                  aria-hidden="true"
                />
                <span>{t.importedWorkspaceSourceHeading}</span>
              </h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {sourceDetail}
              </p>
              {overview.redirectHopsCount > 1 && (
                <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {t.linkImportRedirectChainLabel}: {overview.redirectHopsCount} hop(s)
                </p>
              )}
              {overview.sources.length > 0 && (
                <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {t.importedWorkspaceExternalLinksHeading}:
                  </span>
                  {overview.sources.map((src, idx) =>
                    src.url && isSafeHttpUrl(src.url) ? (
                      <a
                        key={`${idx}-${src.url}`}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-zinc-800 dark:text-zinc-200 hover:underline"
                      >
                        <span>{src.sourceType}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                      </a>
                    ) : null
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                {t.importedWorkspaceVerificationHeading}
              </h4>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 border-t border-b border-zinc-100 dark:border-zinc-800/80">
                {overview.verificationRows.map((row) => (
                  <div
                    key={row.key}
                    className="py-2 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {isMy ? row.labelMy : row.labelEn}
                      </span>
                      <span className="text-zinc-500 dark:text-zinc-400 ml-2 break-words">
                        {isMy ? row.valueMy : row.valueEn}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 font-medium shrink-0 whitespace-nowrap ${getStatusColorClass(
                        row.status
                      )}`}
                    >
                      <StatusIcon status={row.status} />
                      <span>{t.dataStatusLabels[row.status]}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Unavailable Data & Honest Missing Notes */}
          <div className="space-y-2.5">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-zinc-950 dark:text-zinc-50">
              <AlertCircle
                className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0"
                aria-hidden="true"
              />
              <span>{t.importedWorkspaceUnavailableHeading}</span>
            </h4>

            {unavailableItems.length > 0 ? (
              <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed list-disc pl-4">
                {unavailableItems.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                {t.importedWorkspaceNoUnavailableNote}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
