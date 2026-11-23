import { type ComponentProps, useMemo } from 'react';
import { ImageOff, Link2, SlidersHorizontal } from 'lucide-react';
import type {
  Language,
  ResearchCostSummary,
  ResearchMode,
  ResearchQuantity,
  SingleProductHistoryRecord,
} from '../types/product';
import { getCategoryLabel } from '../utils/categoryRegistry';
import { formatThb, resolveProductImageDisplayConfig } from '../utils/format';
import { formatCredits } from '../utils/kalodataPricing';
import { formatResearchDateTime } from '../utils/savedProductsStorage';
import { evaluateProductOpportunity } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';
import { ProductLinkImportPanel } from './ProductLinkImportPanel';
import { ResearchSettingsPanel } from './ResearchSettingsPanel';

type ResearchSettingsProps = Omit<
  ComponentProps<typeof ResearchSettingsPanel>,
  'compactTop' | 'canCollapse' | 'onCollapse' | 'layout'
>;

type LinkImportProps = Omit<
  ComponentProps<typeof ProductLinkImportPanel>,
  'compactTop' | 'layout' | 'onClose'
>;

interface DiscoveryLauncherProps {
  language: Language;
  settingsExpanded: boolean;
  onExpandSettingsChange: (expanded: boolean) => void;
  singleDrawerOpen: boolean;
  onSingleDrawerOpenChange: (open: boolean) => void;
  recentSingleRecord: SingleProductHistoryRecord | null;
  onOpenRecentSingleResult: () => void;
  salesWeightPct: number;
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
  settingsExpanded,
  onExpandSettingsChange,
  singleDrawerOpen,
  onSingleDrawerOpenChange,
  recentSingleRecord,
  onOpenRecentSingleResult,
  salesWeightPct,
  hasResults,
  lastCostSummary,
  singleHistoryCount,
  settingsProps,
  linkImportProps,
}: DiscoveryLauncherProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  const showBatchDrawer = hasResults && settingsExpanded && !settingsProps.isHunting;

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

  const recentSingleScore = useMemo(() => {
    if (!recentSingleRecord) return null;
    return evaluateProductOpportunity(recentSingleRecord.product, { salesWeightPct }).totalScore;
  }, [recentSingleRecord, salesWeightPct]);

  const recentProduct = recentSingleRecord?.product ?? null;
  const recentImgConfig = recentProduct ? resolveProductImageDisplayConfig(recentProduct) : null;

  const singleRowContent = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
      {recentSingleRecord && recentProduct ? (
        <button
          type="button"
          onClick={onOpenRecentSingleResult}
          className="flex items-center gap-3 min-w-0 flex-1 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 rounded-lg"
        >
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shrink-0">
            {recentImgConfig?.canRender && recentImgConfig.src ? (
              <ProductImage
                src={recentImgConfig.src}
                fallbackSrc={recentImgConfig.fallbackSrc}
                productId={recentImgConfig.productId}
                alt={recentProduct.name}
                title={isMy ? recentProduct.nameMy : recentProduct.name}
                unavailableLabel={t.cardImageUnverified}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageOff className="w-4 h-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {t.singleRecentLabel}
              </span>
              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                ·
              </span>
              <span>{getCategoryLabel(recentProduct.category, language, { short: true })}</span>
              {typeof recentProduct.priceThb === 'number' && (
                <>
                  <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                    ·
                  </span>
                  <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                    {formatThb(recentProduct.priceThb)}
                  </span>
                </>
              )}
              {recentSingleScore !== null && (
                <>
                  <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                    ·
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                    {recentSingleScore}/100
                  </span>
                </>
              )}
              <span aria-hidden="true" className="hidden md:inline text-zinc-300 dark:text-zinc-600">
                ·
              </span>
              <span className="hidden md:inline font-mono tabular-nums">
                {formatResearchDateTime(recentSingleRecord.researchedAt, language)}
              </span>
            </div>

            <div className="text-xs sm:text-[13px] font-semibold text-zinc-950 dark:text-zinc-50 group-hover:underline truncate">
              {isMy ? recentProduct.nameMy : recentProduct.name}
            </div>
          </div>
        </button>
      ) : (
        <div className="text-xs sm:text-[13px] text-zinc-600 dark:text-zinc-400 min-w-0 truncate">
          {t.singleEmptyBarHint}
        </div>
      )}

      <button
        type="button"
        onClick={() => onSingleDrawerOpenChange(true)}
        className="sp-btn-secondary min-h-[40px] whitespace-nowrap shrink-0 self-start sm:self-center"
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
  );

  return (
    <div className="mt-4 sm:mt-5">
      {hasResults ? (
        /* Unified Direct 1-Click Launcher Card (Batch Discovery + Single Link Research & Recent) */
        <section
          aria-label={t.settingsHeading}
          className="sp-card px-4 py-3 space-y-3"
        >
          {/* Row 1: Batch Discovery Summary + Direct 1-Click Drawer Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
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

            <button
              type="button"
              disabled={settingsProps.isHunting}
              onClick={() => onExpandSettingsChange(true)}
              className="sp-btn-secondary min-h-[40px] whitespace-nowrap shrink-0 self-start sm:self-center disabled:opacity-50"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                {settingsProps.isHunting ? t.huntingInProgress : t.launcherTabBatch}
              </span>
            </button>
          </div>

          {/* Row 2: Single Link Research & Recent Product + Direct 1-Click Drawer Button */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
            {singleRowContent}
          </div>
        </section>
      ) : (
        /* First Visit (No Batch Results Yet): Compact Single Link Bar + Inline Batch Setup */
        <>
          <section aria-label={t.linkImportHeading} className="sp-card px-4 py-3">
            {singleRowContent}
          </section>

          <ResearchSettingsPanel
            {...settingsProps}
            layout="inline"
            compactTop
            canCollapse={false}
          />
        </>
      )}

      {/* Full-Height Slide-over Batch Settings Drawer */}
      {showBatchDrawer && (
        <ResearchSettingsPanel
          {...settingsProps}
          layout="drawer"
          canCollapse
          onCollapse={() => onExpandSettingsChange(false)}
        />
      )}

      {/* Full-Height Slide-over Single Link Research Drawer */}
      {singleDrawerOpen && (
        <ProductLinkImportPanel
          {...linkImportProps}
          layout="drawer"
          onClose={() => onSingleDrawerOpenChange(false)}
        />
      )}
    </div>
  );
}
