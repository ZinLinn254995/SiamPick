import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Download,
  ImageOff,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  ComparisonSelectionItem,
  Language,
  SavedProductRecord,
} from '../types/product';
import { buildProductComparisonMatrix } from '../utils/productAnalytics';
import {
  buildProductsExportCsv,
  buildProductsExportJson,
  triggerFileDownload,
} from '../utils/exportReports';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';

interface ProductComparisonModalProps {
  isOpen: boolean;
  items: ComparisonSelectionItem[];
  savedRecords: SavedProductRecord[];
  salesWeightPct: number;
  onRemoveItem: (selectionKey: string) => void;
  onAddSavedRecord: (record: SavedProductRecord) => void;
  onClearAll: () => void;
  onOpenReport: (item: ComparisonSelectionItem) => void;
  onClose: () => void;
  language: Language;
}

export function ProductComparisonModal({
  isOpen,
  items,
  savedRecords,
  salesWeightPct,
  onRemoveItem,
  onAddSavedRecord,
  onClearAll,
  onOpenReport,
  onClose,
  language,
}: ProductComparisonModalProps) {
  const [selectedSavedId, setSelectedSavedId] = useState('');
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const matrix = useMemo(
    () => buildProductComparisonMatrix(items, salesWeightPct),
    [items, salesWeightPct]
  );

  const selectedKeySet = useMemo(
    () => new Set(items.map((item) => item.selectionKey)),
    [items]
  );

  const addableSavedRecords = useMemo(
    () =>
      savedRecords.filter(
        (rec) => !selectedKeySet.has(`saved:${rec.id}`)
      ),
    [savedRecords, selectedKeySet]
  );

  if (!isOpen) return null;

  const handleAddSaved = () => {
    if (!selectedSavedId) return;
    const found = savedRecords.find((r) => r.id === selectedSavedId);
    if (found) {
      onAddSavedRecord(found);
      setSelectedSavedId('');
    }
  };

  const handleExportCsv = () => {
    const products = matrix.columns.map((c) => c.item.product);
    const evalMap = new Map(matrix.columns.map((c) => [c.item.product.id, c.evaluation]));
    const csv = buildProductsExportCsv(products, {
      salesWeightPct,
      evaluations: evalMap,
      exportTitle: 'SiamPick Product Comparison Export',
      language,
    });
    triggerFileDownload(csv, 'siampick-product-comparison.csv', 'text/csv;charset=utf-8;');
  };

  const handleExportJson = () => {
    const products = matrix.columns.map((c) => c.item.product);
    const evalMap = new Map(matrix.columns.map((c) => [c.item.product.id, c.evaluation]));
    const json = buildProductsExportJson(products, {
      salesWeightPct,
      evaluations: evalMap,
      exportTitle: 'SiamPick Product Comparison Export',
      language,
    });
    triggerFileDownload(
      json,
      'siampick-product-comparison.json',
      'application/json;charset=utf-8;'
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/45 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-comparison-heading"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[1220px] max-h-[92vh] bg-white border border-zinc-200 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-zinc-200 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5">
              <h2
                id="product-comparison-heading"
                className="font-display text-lg sm:text-xl font-bold text-zinc-950"
              >
                {t.compareModalTitle}
              </h2>
              <span className="font-mono text-xs text-zinc-500 tabular-nums">
                ({items.length})
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500 leading-relaxed max-w-3xl">
              {t.compareModalSubtitle}
            </p>
            {matrix.hasDistinctProductIds && (
              <p className="mt-1 text-[11px] text-zinc-500">
                {t.compareDistinctIdsNote} ({matrix.distinctProductIdCount} Product IDs)
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {items.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 rounded-lg hover:border-zinc-400 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.exportCsvBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 rounded-lg hover:border-zinc-400 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.exportJsonBtn}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t.reportClose}
              className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Add Saved Product to Compare Toolbar (connects Saved Products with Live Results cleanly) */}
        {addableSavedRecords.length > 0 && (
          <div className="shrink-0 px-5 sm:px-6 py-3 bg-zinc-50/80 border-b border-zinc-200/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <label
                htmlFor="compare-add-saved"
                className="text-xs font-medium text-zinc-700 whitespace-nowrap"
              >
                {t.compareAddSavedLabel}:
              </label>
              <select
                id="compare-add-saved"
                value={selectedSavedId}
                onChange={(e) => setSelectedSavedId(e.target.value)}
                className="min-h-[36px] max-w-sm flex-1 px-2.5 py-1 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-900 focus:outline-none focus:border-zinc-900 cursor-pointer"
              >
                <option value="">{t.compareAddSavedPlaceholder}</option>
                {addableSavedRecords.map((rec) => (
                  <option key={rec.id} value={rec.id}>
                    {(isMy ? rec.product.nameMy : rec.product.name).slice(0, 65)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedSavedId}
                onClick={handleAddSaved}
                className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 text-xs font-medium text-white bg-zinc-950 rounded-lg hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.compareSelectBtn}</span>
              </button>
            </div>

            {items.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs font-medium text-zinc-500 hover:text-red-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                {t.compareClearBtn}
              </button>
            )}
          </div>
        )}

        {/* Comparison Table Body */}
        <div className="flex-1 overflow-auto">
          {items.length < 2 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm font-medium text-zinc-900">{t.compareNeedTwoNote}</p>
              <p className="text-xs text-zinc-500">
                {items.length} / 2 {t.quantityProductsUnit}
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-zinc-50 px-3 sm:px-5 py-3.5 sm:py-4 w-32 min-w-[120px] sm:w-48 sm:min-w-[170px] text-xs font-semibold text-zinc-600 align-bottom border-r border-zinc-200/80"
                  >
                    {isMy ? 'နှိုင်းယှဉ်ချက်များ' : 'Comparison Metrics'}
                  </th>
                  {matrix.columns.map((col) => {
                    const p = col.item.product;
                    const displayName = isMy ? p.nameMy : p.name;
                    const hasVerifiedImg = p.imageVerified && Boolean(p.imageUrl);
                    return (
                      <th
                        key={col.item.selectionKey}
                        scope="col"
                        className="px-3.5 sm:px-4 py-3.5 sm:py-4 min-w-[200px] sm:min-w-[240px] max-w-[280px] sm:max-w-[300px] align-top border-r border-zinc-100 last:border-r-0"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 font-normal">
                            <span className="truncate">
                              {isMy ? col.item.sourceLabelMy : col.item.sourceLabelEn}
                            </span>
                            <button
                              type="button"
                              onClick={() => onRemoveItem(col.item.selectionKey)}
                              aria-label={`${t.compareRemoveBtn}: ${displayName}`}
                              className="inline-flex items-center gap-1 text-zinc-400 hover:text-red-700 transition-colors cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>

                          <div className="aspect-[4/3] w-full rounded-lg overflow-hidden bg-zinc-100">
                            {hasVerifiedImg && p.imageUrl ? (
                              <ProductImage
                                src={p.imageUrl}
                                alt={p.name}
                                title={displayName}
                                unavailableLabel={t.cardImageUnverified}
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
                                <ImageOff className="w-5 h-5 text-zinc-400 mb-1" aria-hidden="true" />
                                <span className="text-[11px] font-normal text-zinc-500">
                                  {t.cardImageUnverified}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="space-y-1">
                            <div className="font-display text-sm font-semibold text-zinc-950 line-clamp-2 leading-snug">
                              {displayName}
                            </div>
                            <div className="text-[11px] font-normal text-zinc-500 truncate">
                              {p.shopName}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onOpenReport(col.item)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-950 transition-colors cursor-pointer"
                          >
                            <span>{t.cardOpenReport}</span>
                            <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs">
                {matrix.rows.map((row) => (
                  <tr key={row.key} className="hover:bg-zinc-50/50 transition-colors">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-white px-3 sm:px-5 py-3 font-medium text-zinc-700 align-top border-r border-zinc-200/80"
                    >
                      <div>{isMy ? row.labelMy : row.labelEn}</div>
                      {row.isDifferent && (
                        <div className="mt-0.5 text-[10px] font-medium text-amber-700">
                          {t.compareDiffTag}
                        </div>
                      )}
                    </th>
                    {(isMy ? row.valuesMy : row.valuesEn).map((val, idx) => {
                      const isUnavailable = val === 'Unavailable';
                      return (
                        <td
                          key={`${row.key}-${matrix.columns[idx].item.selectionKey}`}
                          className={`px-3.5 sm:px-4 py-3 align-top leading-relaxed border-r border-zinc-100 last:border-r-0 ${
                            isUnavailable
                              ? 'text-zinc-400 italic'
                              : row.isNumeric
                                ? 'font-mono tabular-nums text-zinc-950'
                                : 'text-zinc-800'
                          }`}
                        >
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
