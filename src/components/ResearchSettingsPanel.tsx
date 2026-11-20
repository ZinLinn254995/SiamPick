import {
  ArrowRight,
  Loader2,
  Lock,
  PauseCircle,
  PlayCircle,
  SlidersHorizontal,
} from 'lucide-react';
import {
  CategoryFilter,
  Language,
  ResearchQuantity,
  ResearchQuotaStatus,
  StrategyPreset,
} from '../types/product';
import { TRANSLATIONS } from '../i18n/translations';

interface ResearchSettingsPanelProps {
  category: CategoryFilter;
  onCategoryChange: (category: CategoryFilter) => void;
  strategyPreset: StrategyPreset;
  salesWeightPct: number;
  onSelectStrategyPreset: (preset: StrategyPreset) => void;
  onCustomWeightChange: (weight: number) => void;
  showFineTune: boolean;
  onToggleFineTune: () => void;
  quantity: ResearchQuantity;
  onQuantityChange: (quantity: ResearchQuantity) => void;
  isHunting: boolean;
  quotaStatus: ResearchQuotaStatus;
  onPauseResearch: () => void;
  onResumeResearch: () => void;
  onStartHunting: () => void;
  language: Language;
}

const QUANTITIES: ResearchQuantity[] = [10, 20, 30];

export function ResearchSettingsPanel({
  category,
  onCategoryChange,
  strategyPreset,
  salesWeightPct,
  onSelectStrategyPreset,
  onCustomWeightChange,
  showFineTune,
  onToggleFineTune,
  quantity,
  onQuantityChange,
  isHunting,
  quotaStatus,
  onPauseResearch,
  onResumeResearch,
  onStartHunting,
  language,
}: ResearchSettingsPanelProps) {
  const t = TRANSLATIONS[language];

  const categorySummary =
    category === 'all'
      ? t.settingBothCategories
      : category === 'womens-fashion'
        ? t.categoryFashion
        : t.categoryBeauty;

  const strategySummary =
    strategyPreset === 'balanced'
      ? t.strategyBalanced
      : strategyPreset === 'sales-first'
        ? t.strategySales
        : t.strategyCommission;

  return (
    <section
      aria-labelledby="research-settings-heading"
      className="mt-8 bg-white border border-zinc-200/90 rounded-xl p-5 sm:p-6 space-y-6"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="research-settings-heading"
          className="font-display text-sm font-semibold text-zinc-950"
        >
          {t.settingsHeading}
        </h2>

        <div className="flex items-center gap-4">
          {!isHunting &&
            (quotaStatus.paused ? (
              <button
                type="button"
                onClick={onResumeResearch}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.btnResumeResearch}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onPauseResearch}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer whitespace-nowrap"
              >
                <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.btnPauseResearch}</span>
              </button>
            ))}

          <button
            type="button"
            onClick={onToggleFineTune}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 transition-colors cursor-pointer whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.weightFineTune}</span>
          </button>
        </div>
      </div>

      {/* Fixed & Core Research Specifications (Clean 3-Column Unboxed Readout) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-5 border-b border-zinc-100">
        {/* 1. Market (Always Fixed) */}
        <div className="space-y-1">
          <div className="text-xs text-zinc-500">{t.settingMarketLabel}</div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-950">
            <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" aria-hidden="true" />
            <span>{t.settingMarketValue}</span>
          </div>
          <div className="text-xs text-zinc-400">{t.settingFixedNote}</div>
        </div>

        {/* 3. Product Price (Unrestricted) */}
        <div className="space-y-1">
          <div className="text-xs text-zinc-500">{t.settingPriceLabel}</div>
          <div className="text-sm font-medium text-zinc-950">{t.settingPriceValue}</div>
          <div className="text-xs text-zinc-400 font-mono tabular-nums">THB (฿)</div>
        </div>

        {/* 4. Commission Strategy (Balanced) */}
        <div className="space-y-1">
          <div className="text-xs text-zinc-500">{t.strategyLabel}</div>
          <div className="text-sm font-medium text-zinc-950">
            {strategySummary}{' '}
            <span className="font-mono text-xs font-normal text-zinc-500 tabular-nums">
              ({salesWeightPct}/{100 - salesWeightPct})
            </span>
          </div>
          <div className="text-xs text-zinc-400">{t.settingStrategyValue}</div>
        </div>
      </div>

      {/* Optional Strategy Balance Fine-Tuning (Collapsed by default to keep UI minimal) */}
      {showFineTune && (
        <div className="pb-5 border-b border-zinc-100 space-y-3.5">
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label={t.strategyLabel}
          >
            {(
              [
                { id: 'balanced', label: t.strategyBalanced },
                { id: 'sales-first', label: t.strategySales },
                { id: 'commission-first', label: t.strategyCommission },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectStrategyPreset(preset.id)}
                className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  strategyPreset === preset.id
                    ? 'bg-zinc-950 text-white border-zinc-950'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400 hover:text-zinc-950'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="max-w-md space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-600">
                {t.salesWeight}{' '}
                <span className="font-mono font-medium tabular-nums text-zinc-950">
                  {salesWeightPct}%
                </span>
              </span>
              <span className="text-zinc-600">
                {t.commissionWeight}{' '}
                <span className="font-mono font-medium tabular-nums text-emerald-700">
                  {100 - salesWeightPct}%
                </span>
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={90}
              step={5}
              value={salesWeightPct}
              onChange={(e) => onCustomWeightChange(Number(e.target.value))}
              aria-label={t.weightFineTune}
              className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-950"
            />
          </div>
        </div>
      )}

      {/* Interactive Selections: 2. Product Category + 5. Research Quantity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-end">
        {/* 2. Product Category */}
        <div className="lg:col-span-7 space-y-2">
          <div className="text-xs font-medium text-zinc-700">{t.settingCategoryLabel}</div>
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1 bg-zinc-100 rounded-lg"
            role="group"
            aria-label={t.settingCategoryLabel}
          >
            {(
              [
                { id: 'all', label: t.settingBothCategories },
                { id: 'womens-fashion', label: t.categoryFashion },
                { id: 'cosmetics-beauty', label: t.categoryBeauty },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onCategoryChange(item.id)}
                className={`min-h-[40px] px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer whitespace-nowrap text-center ${
                  category === item.id
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Research Quantity */}
        <div className="lg:col-span-5 space-y-2">
          <div className="text-xs font-medium text-zinc-700">{t.settingQuantityLabel}</div>
          <div
            className="grid grid-cols-3 gap-2 p-1 bg-zinc-100 rounded-lg"
            role="group"
            aria-label={t.settingQuantityLabel}
          >
            {QUANTITIES.map((qty) => (
              <button
                key={qty}
                type="button"
                onClick={() => onQuantityChange(qty)}
                className={`min-h-[40px] px-2.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer whitespace-nowrap text-center font-mono tabular-nums ${
                  quantity === qty
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                {qty} <span className="font-sans">{t.quantityProductsUnit}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Primary Action Footer */}
      <div className="pt-5 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-xs text-zinc-500 leading-relaxed">
          {t.settingMarketValue} · {categorySummary} · {t.settingPriceValue} · {strategySummary} ·{' '}
          <span className="font-mono tabular-nums text-zinc-800">
            {quantity} {t.quantityProductsUnit}
          </span>
        </p>

        <button
          type="button"
          onClick={onStartHunting}
          disabled={isHunting}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-2.5 text-sm font-medium text-white bg-zinc-950 rounded-lg hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-70 transition-all cursor-pointer whitespace-nowrap shrink-0 w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
        >
          {isHunting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>{t.huntingInProgress}</span>
            </>
          ) : (
            <>
              <span>{quotaStatus.paused ? t.resumeAndStartBtn : t.startHuntingBtn}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </section>
  );
}
