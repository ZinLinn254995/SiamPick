import { type ComponentProps } from 'react';
import { Link2, SlidersHorizontal } from 'lucide-react';
import type { Language, ResearchCostSummary, ResearchMode, ResearchQuantity } from '../types/product';
import { getCategoryLabel } from '../utils/categoryRegistry';
import { formatCredits } from '../utils/kalodataPricing';
import { TRANSLATIONS } from '../i18n/translations';
import { ResearchSettingsPanel } from './ResearchSettingsPanel';
import { ProductLinkImportPanel } from './ProductLinkImportPanel';

export type DiscoveryLauncherTab = 'batch' | 'single';

type ResearchSettingsProps = Omit<
  ComponentProps<typeof ResearchSettingsPanel>,
  'compactTop' | 'canCollapse' | 'onCollapse'
>;

type LinkImportProps = Omit<ComponentProps<typeof ProductLinkImportPanel>, 'compactTop'>;

interface DiscoveryLauncherProps {
  language: Language;
  activeTab: DiscoveryLauncherTab;
  onTabChange: (tab: DiscoveryLauncherTab) => void;
  settingsExpanded: boolean;
  onExpandSettingsChange: (expanded: boolean) => void;
  hasResults: boolean;
  lastCostSummary: ResearchCostSummary | null;
  singleHistoryCount: number;
  settingsProps: ResearchSettingsProps;
  linkImportProps: LinkImportProps;
}

function getCompactModeLabel(mode: ResearchMode, language: Language): string {
  const t = TRANSLATIONS[language];
  if (mode === 'fast') return t.modeFastTitle;
  if (mode === 'balanced') return t.modeBalancedTitle;
  return t.modeDeepTitle;
}

function formatCompactCategoriesLabel(
  selectedCategories: ResearchSettingsProps['selectedCategories'],
  selectedSubcategoryIds: readonly string[],
  language: Language
): string {
  const isMy = language === 'my';
  if (selectedCategories.length === 0) {
    return isMy ? 'Category မရွေးရသေးပါ' : 'No category';
  }

  let primaryLabel: string;
  if (selectedCategories.length <= 2) {
    primaryLabel = selectedCategories
      .map((cat) => getCategoryLabel(cat, language, { short: true }))
      .join(' · ');
  } else {
    const first = getCategoryLabel(selectedCategories[0], language, { short: true });
    primaryLabel = isMy
      ? `${first} +${selectedCategories.length - 1} မျိုး`
      : `${first} +${selectedCategories.length - 1} more`;
  }

  if (selectedSubcategoryIds.length > 0) {
    return isMy
      ? `${primaryLabel} (${selectedSubcategoryIds.length} L2)`
      : `${primaryLabel} (${selectedSubcategoryIds.length} sub)`;
  }
  return primaryLabel;
}

function formatCompactQuantity(quantity: ResearchQuantity, language: Language): string {
  return language === 'my' ? `ကုန်ပစ္စည်း ${quantity} ခု` : `${quantity} products`;
}

export function DiscoveryLauncher({
  language,
  activeTab,
  onTabChange,
  settingsExpanded,
  onExpandSettingsChange,
  hasResults,
  lastCostSummary,
  singleHistoryCount,
  settingsProps,
  linkImportProps,
}: DiscoveryLauncherProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  const showCompactBatchSummary =
    activeTab === 'batch' &&
    hasResults &&
    !settingsExpanded &&
    !settingsProps.isHunting;

  const categoriesLabel = formatCompactCategoriesLabel(
    settingsProps.selectedCategories,
    settingsProps.selectedSubcategoryIds,
    language
  );
  const modeLabel = getCompactModeLabel(settingsProps.researchMode, language);
  const quantityLabel = formatCompactQuantity(settingsProps.quantity, language);
  const limitLabel = isMy
    ? `Limit: ${formatCredits(settingsProps.spendingLimitCredits)} cr`
    : `Cap: ${formatCredits(settingsProps.spendingLimitCredits)} cr`;

  return (
    <div className="mt-4 sm:mt-5">
      {/* Segmented Mode Switcher: Batch Discovery | Single Link Research */}
      <div
        role="tablist"
        aria-label={isMy ? 'ရှာဖွေမှုပုံစံ ရွေးချယ်ရန်' : 'Discovery Mode'}
        className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-zinc-100/90 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'batch'}
          onClick={() => onTabChange('batch')}
          className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs sm:text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
            activeTab === 'batch'
              ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{t.launcherTabBatch}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'single'}
          onClick={() => onTabChange('single')}
          className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs sm:text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
            activeTab === 'single'
              ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
          }`}
        >
          <Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{t.launcherTabSingle}</span>
          {singleHistoryCount > 0 && (
            <span className="font-mono text-xs tabular-nums opacity-70">
              ({singleHistoryCount})
            </span>
          )}
        </button>
      </div>

      {/* Tab Panel 1: Batch Discovery (Collapsed Summary Bar vs Full Settings) */}
      {activeTab === 'batch' ? (
        showCompactBatchSummary ? (
          <section
            aria-label={t.settingsHeading}
            className="mt-2.5 sp-card px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
          >
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-[13px] text-zinc-700 dark:text-zinc-300 min-w-0">
              <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                {categoriesLabel}
              </span>
              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                ·
              </span>
              <span>{modeLabel}</span>
              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                ·
              </span>
              <span className="font-mono tabular-nums">{quantityLabel}</span>
              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                ·
              </span>
              <span className="font-mono tabular-nums">{limitLabel}</span>
              {settingsProps.myanmarLanguageOnly && (
                <>
                  <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                    ·
                  </span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {t.myanmarFilterActiveBadge}
                  </span>
                </>
              )}
              {lastCostSummary?.actualCredits != null && (
                <>
                  <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                    ·
                  </span>
                  <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                    {isMy ? 'ကုန်ကျ' : 'Actual'}: {formatCredits(lastCostSummary.actualCredits)} cr
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onExpandSettingsChange(true)}
                className="sp-btn-secondary min-h-[40px] whitespace-nowrap shrink-0"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t.launcherEditSettingsBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange('single')}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t.launcherCheckLinkBtn}</span>
              </button>
            </div>
          </section>
        ) : (
          <ResearchSettingsPanel
            {...settingsProps}
            compactTop
            canCollapse={hasResults}
            onCollapse={() => onExpandSettingsChange(false)}
          />
        )
      ) : (
        <ProductLinkImportPanel {...linkImportProps} compactTop />
      )}
    </div>
  );
}
