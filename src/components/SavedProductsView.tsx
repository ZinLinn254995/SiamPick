import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Calendar,
  Check,
  Copy,
  Download,
  ExternalLink,
  ImageOff,
  Trash2,
} from 'lucide-react';
import {
  CategoryFilter,
  DataStatus,
  Language,
  SavedProductRecord,
  ScoreTier,
} from '../types/product';
import { formatThb } from '../utils/format';
import { evaluateProductOpportunity, normalizeDataStatus } from '../utils/scoring';
import { formatResearchDate } from '../utils/savedProductsStorage';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';

interface SavedProductsViewProps {
  records: SavedProductRecord[];
  salesWeightPct: number;
  onDelete: (id: string) => void;
  onOpenReport: (record: SavedProductRecord) => void;
  onBackToHunting: () => void;
  language: Language;
}

type SavedSortKey = 'newest' | 'score-desc' | 'price-asc' | 'price-desc';

function tierColorClass(tier: ScoreTier): string {
  if (tier === 'priority-test') return 'text-emerald-700';
  if (tier === 'investigate-further') return 'text-amber-700';
  return 'text-zinc-500';
}

function dataStatusColorClass(status: DataStatus): string {
  if (status === 'verified') return 'text-emerald-700';
  if (status === 'estimated') return 'text-amber-700';
  return 'text-zinc-400';
}

export function SavedProductsView({
  records,
  salesWeightPct,
  onDelete,
  onOpenReport,
  onBackToHunting,
  language,
}: SavedProductsViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortKey, setSortKey] = useState<SavedSortKey>('newest');
  const [copied, setCopied] = useState(false);

  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  const evaluatedRecords = useMemo(() => {
    const filtered = records.filter((rec) => {
      if (categoryFilter !== 'all' && rec.product.category !== categoryFilter) {
        return false;
      }
      return true;
    });

    const peers = filtered.map((r) => r.product);
    const mapped = filtered.map((record) => ({
      record,
      evaluation: evaluateProductOpportunity(record.product, {
        salesWeightPct,
        peerProducts: peers,
      }),
    }));

    return mapped.sort((a, b) => {
      const priceA = a.record.product.priceThb ?? Number.POSITIVE_INFINITY;
      const priceB = b.record.product.priceThb ?? Number.POSITIVE_INFINITY;
      switch (sortKey) {
        case 'newest':
          return new Date(b.record.savedAt).getTime() - new Date(a.record.savedAt).getTime();
        case 'score-desc':
          return b.evaluation.totalScore - a.evaluation.totalScore;
        case 'price-asc':
          return priceA - priceB;
        case 'price-desc': {
          const descA = a.record.product.priceThb ?? -1;
          const descB = b.record.product.priceThb ?? -1;
          return descB - descA;
        }
        default:
          return 0;
      }
    });
  }, [records, categoryFilter, sortKey, salesWeightPct]);

  const avgScore =
    evaluatedRecords.length > 0
      ? Math.round(
          evaluatedRecords.reduce((sum, item) => sum + item.evaluation.totalScore, 0) /
            evaluatedRecords.length
        )
      : 0;

  const handleExportCsv = () => {
    const header = [
      'Product Name',
      'Brand',
      'Category',
      'Price (THB)',
      'Price Status',
      'Commission Rate',
      'Opportunity Score (Internal / 100)',
      'Recommendation Tier',
      'Confidence Level',
      'Research Date',
      'Sources',
    ];
    const rows = evaluatedRecords.map(({ record, evaluation }) => {
      const p = record.product;
      const pStatus: DataStatus = normalizeDataStatus(
        p.priceThb === null || p.priceThb <= 0 ? 'unavailable' : (p.priceStatus ?? 'estimated')
      );
      const sourceText = record.sources
        .map((s) => (s.url ? `${s.labelEn} (${s.url})` : s.labelEn))
        .join(' | ');
      return [
        `"${p.name.replace(/"/g, '""')}"`,
        `"${(p.brand ?? p.shopName).replace(/"/g, '""')}"`,
        p.category === 'womens-fashion' ? "Women's Fashion" : 'Cosmetics & Beauty',
        p.priceThb !== null && p.priceThb > 0 ? p.priceThb : 'Unavailable',
        pStatus,
        p.commissionVerified && p.commissionRate !== null
          ? `${p.commissionRate}%`
          : normalizeDataStatus(p.commissionStatus ?? 'unavailable'),
        evaluation.totalScore,
        `"${t.scoringTierLabels[evaluation.tier]}"`,
        evaluation.confidenceLevel,
        record.researchDate.slice(0, 10),
        `"${sourceText.replace(/"/g, '""')}"`,
      ];
    });
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'siampick-saved-products.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopySummary = async () => {
    const text = evaluatedRecords
      .map(({ record, evaluation }, i) => {
        const p = record.product;
        const pStatus: DataStatus = normalizeDataStatus(
          p.priceThb === null || p.priceThb <= 0 ? 'unavailable' : (p.priceStatus ?? 'estimated')
        );
        const priceStr =
          p.priceThb !== null && p.priceThb > 0
            ? `${formatThb(p.priceThb)} (${pStatus})`
            : pStatus;
        const comm =
          p.commissionVerified && p.commissionRate !== null
            ? `${p.commissionRate}%`
            : normalizeDataStatus(p.commissionStatus ?? 'unavailable');
        const dateStr = formatResearchDate(record.researchDate, language);
        const verifiedUrls = record.sources
          .filter((s) => s.verified && s.url)
          .map((s) => s.url)
          .join(', ');
        return `${i + 1}. ${p.name} — ${priceStr} | Comm: ${comm} | Score: ${evaluation.totalScore}/100 | Date: ${dateStr}${verifiedUrls ? ` | Source: ${verifiedUrls}` : ''}`;
      })
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <section aria-labelledby="saved-products-heading" className="space-y-8">
      {/* Header & Back Navigation */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBackToHunting}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 transition-colors cursor-pointer py-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t.savedViewBackBtn}</span>
        </button>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-zinc-200">
          <div className="max-w-2xl">
            <div className="flex items-baseline gap-2.5">
              <h1
                id="saved-products-heading"
                className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950"
              >
                {t.savedViewTitle}
              </h1>
              <span className="font-mono text-sm text-zinc-500 tabular-nums">
                ({records.length})
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
              {t.savedViewSubtitle}
            </p>
            <p className="mt-1.5 text-xs text-zinc-400">{t.savedStorageNote}</p>
          </div>

          {records.length > 0 && (
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleCopySummary}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                    <span>{t.reportCopied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.shortlistCopySummary}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium text-white bg-zinc-950 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.shortlistExportCsv}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Empty State */}
      {records.length === 0 ? (
        <div className="bg-white border border-zinc-200/90 rounded-xl px-6 py-16 text-center">
          <div className="w-11 h-11 rounded-xl bg-zinc-100 text-zinc-500 inline-flex items-center justify-center mb-4">
            <Bookmark className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="font-display text-base sm:text-lg font-semibold text-zinc-950">
            {t.shortlistEmptyTitle}
          </h2>
          <p className="mt-2 text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
            {t.shortlistEmptyDesc}
          </p>
          <button
            type="button"
            onClick={onBackToHunting}
            className="mt-6 inline-flex items-center gap-2 min-h-[42px] px-5 py-2 text-sm font-medium text-white bg-zinc-950 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>{t.savedViewBackBtn}</span>
          </button>
        </div>
      ) : (
        <>
          {/* Filter, Summary & Sort Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
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
                    onClick={() => setCategoryFilter(tab.id)}
                    className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      categoryFilter === tab.id
                        ? 'bg-white text-zinc-950 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <span className="text-xs text-zinc-500 font-mono tabular-nums">
                {t.shortlistAvgScore}: <strong className="text-zinc-950">{avgScore}/100</strong>
              </span>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-auto">
              <label htmlFor="saved-sort" className="text-xs font-medium text-zinc-500">
                {t.sortLabel}
              </label>
              <select
                id="saved-sort"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SavedSortKey)}
                className="min-h-[38px] px-3 py-1.5 text-xs sm:text-sm font-medium bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
              >
                <option value="newest">{t.savedSortNewest}</option>
                <option value="score-desc">{t.sortScoreDesc}</option>
                <option value="price-asc">{t.sortPriceAsc}</option>
                <option value="price-desc">{t.sortPriceDesc}</option>
              </select>
            </div>
          </div>

          {/* Saved Product Cards */}
          {evaluatedRecords.length === 0 ? (
            <div className="bg-white border border-zinc-200/90 rounded-xl px-6 py-12 text-center">
              <p className="text-sm text-zinc-500">{t.emptyFilteredTitle}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {evaluatedRecords.map(({ record, evaluation }) => {
                const product = record.product;
                const displayName = isMy ? product.nameMy : product.name;
                const subCategory = isMy ? product.subCategoryMy : product.subCategory;
                const categoryLabel =
                  product.category === 'womens-fashion'
                    ? t.categoryFashion
                    : t.categoryBeauty;
                const hasVerifiedImg = product.imageVerified && Boolean(product.imageUrl);
                const hasVerifiedComm =
                  product.commissionVerified && product.commissionRate !== null;
                const effectivePriceStatus: DataStatus = normalizeDataStatus(
                  product.priceThb === null || product.priceThb <= 0
                    ? 'unavailable'
                    : (product.priceStatus ?? 'estimated')
                );
                const effectiveCommissionStatus: DataStatus = hasVerifiedComm
                  ? 'verified'
                  : normalizeDataStatus(product.commissionStatus ?? 'unavailable');
                const formattedDate = formatResearchDate(record.researchDate, language);

                return (
                  <article
                    key={record.id}
                    className="bg-white border border-zinc-200/90 rounded-xl p-4 sm:p-5 transition-colors hover:border-zinc-300"
                  >
                    <div className="flex flex-col md:flex-row gap-5">
                      {/* Verified Thumbnail */}
                      <button
                        type="button"
                        onClick={() => onOpenReport(record)}
                        className="w-full md:w-48 aspect-[4/3] rounded-lg overflow-hidden bg-zinc-100 shrink-0 cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
                      >
                        {hasVerifiedImg && product.imageUrl ? (
                          <ProductImage
                            src={product.imageUrl}
                            alt={product.name}
                            title={displayName}
                            unavailableLabel={t.cardImageUnverified}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center p-4 text-center">
                            <ImageOff className="w-5 h-5 text-zinc-400 mb-1.5" aria-hidden="true" />
                            <span className="text-[11px] text-zinc-500">
                              {t.cardImageUnverified}
                            </span>
                          </div>
                        )}
                      </button>

                      {/* Main Details */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between space-y-4">
                        <div className="space-y-3">
                          {/* Top Metadata & Score */}
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                                <span>{categoryLabel}</span>
                                <span aria-hidden="true">·</span>
                                <span>{subCategory}</span>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 font-mono tabular-nums text-zinc-600">
                                  <Calendar className="w-3 h-3 text-zinc-400" aria-hidden="true" />
                                  {t.savedResearchDateLabel}: {formattedDate}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => onOpenReport(record)}
                                className="mt-1.5 text-left cursor-pointer hover:text-zinc-700 transition-colors"
                              >
                                <h3 className="font-display text-base sm:text-lg font-semibold text-zinc-950 leading-snug">
                                  {displayName}
                                </h3>
                              </button>
                            </div>

                            <div className="text-left md:text-right shrink-0">
                              <div className="font-mono text-lg font-semibold text-zinc-950 tabular-nums">
                                {evaluation.totalScore}
                                <span className="text-xs font-normal text-zinc-400">/100</span>
                              </div>
                              <div className={`text-xs font-medium ${tierColorClass(evaluation.tier)}`}>
                                {t.scoringTierLabels[evaluation.tier]}
                              </div>
                            </div>
                          </div>

                          {/* Key Metrics Strip */}
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2.5 border-y border-zinc-100 text-xs">
                            <div>
                              <span className="text-zinc-500 mr-1.5">{t.cardPrice}:</span>
                              {product.priceThb !== null && product.priceThb > 0 ? (
                                <>
                                  <span className="font-mono font-semibold text-zinc-950 tabular-nums">
                                    {formatThb(product.priceThb)}
                                  </span>{' '}
                                  <span
                                    className={`text-[11px] font-medium ${dataStatusColorClass(effectivePriceStatus)}`}
                                  >
                                    ({t.dataStatusLabels[effectivePriceStatus]})
                                  </span>
                                </>
                              ) : (
                                <span className="text-zinc-400 font-medium">
                                  {t.dataStatusLabels[effectivePriceStatus]}
                                </span>
                              )}
                            </div>

                            <div>
                              <span className="text-zinc-500 mr-1.5">{t.cardCommission}:</span>
                              {hasVerifiedComm && product.commissionRate !== null ? (
                                <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                                  {product.commissionRate}%
                                </span>
                              ) : (
                                <span className="text-zinc-400 font-medium">
                                  {t.dataStatusLabels[effectiveCommissionStatus]}
                                </span>
                              )}
                            </div>

                            <div>
                              <span className="text-zinc-500 mr-1.5">{t.cardConfidence}:</span>
                              <span className="font-medium text-zinc-900">
                                {t.confidenceLabels[evaluation.confidenceLevel]}{' '}
                                <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                                  ({evaluation.confidencePct}%)
                                </span>
                              </span>
                            </div>

                            <div className="font-mono text-zinc-500 tabular-nums">
                              {evaluation.verifiedCount}/{evaluation.totalCriteria}{' '}
                              {t.scoringVerifiedCountLabel}
                            </div>
                          </div>

                          {/* Saved Research Sources */}
                          <div className="space-y-1">
                            <div className="text-[11px] font-medium text-zinc-500">
                              {t.savedSourcesLabel}
                            </div>
                            {record.sources.length === 0 ? (
                              <p className="text-xs text-zinc-400">{t.savedNoSources}</p>
                            ) : (
                              <ul className="space-y-1">
                                {record.sources.map((src, idx) => (
                                  <li
                                    key={`${idx}-${src.url ?? src.labelEn}`}
                                    className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600"
                                  >
                                    <span className="truncate max-w-xl">
                                      {isMy ? src.labelMy : src.labelEn}
                                    </span>
                                    {src.verified && src.url ? (
                                      <a
                                        href={src.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline whitespace-nowrap shrink-0"
                                      >
                                        <span>{t.sourceOpenLink}</span>
                                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                      </a>
                                    ) : (
                                      <span className="text-[11px] text-zinc-400 whitespace-nowrap shrink-0">
                                        {t.sourcePendingLink}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>

                        {/* Actions: Open Research Report + Delete Saved Product */}
                        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => onOpenReport(record)}
                            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white bg-zinc-950 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <span>{t.cardOpenReport}</span>
                            <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onDelete(record.id)}
                            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:border-red-300 hover:text-red-700 hover:bg-red-50/40 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{t.savedDeleteBtn}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
