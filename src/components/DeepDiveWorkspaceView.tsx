import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  ImageOff,
  Layers,
  Play,
} from 'lucide-react';
import type {
  DeepDiveAnalysisId,
  DeepDiveSourceContext,
  DeepDiveWorkspaceState,
} from '../types/deepDive';
import type { Language, OpportunityEvaluation, ResearchMode } from '../types/product';
import {
  canRunDeepDiveSelection,
  DEEP_DIVE_ANALYSIS_OPTIONS,
  getDeepDiveOptionById,
} from '../utils/deepDiveRegistry';
import { getCategoryLabel } from '../utils/categoryRegistry';
import { formatThb } from '../utils/format';
import { evaluateProductOpportunity } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';
import { InfoPopover } from './InfoPopover';
import { ProductImage } from './ProductImage';

interface DeepDiveWorkspaceViewProps {
  context: DeepDiveSourceContext;
  workspaceState: DeepDiveWorkspaceState;
  evaluation?: OpportunityEvaluation | null;
  salesWeightPct: number;
  onToggleOption: (id: DeepDiveAnalysisId) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onToggleExpand: (id: DeepDiveAnalysisId) => void;
  onRunSelected: () => void;
  onBack: () => void;
  onOpenProductDetail: () => void;
  language: Language;
}

function getOriginModeLabel(mode: ResearchMode, language: Language): string {
  const t = TRANSLATIONS[language];
  if (mode === 'deep') return t.modeDeepTitle;
  if (mode === 'balanced') return t.modeBalancedTitle;
  return t.modeFastTitle;
}

export function DeepDiveWorkspaceView({
  context,
  workspaceState,
  evaluation: providedEvaluation,
  salesWeightPct,
  onToggleOption,
  onSelectAll,
  onClearAll,
  onToggleExpand,
  onRunSelected,
  onBack,
  onOpenProductDetail,
  language,
}: DeepDiveWorkspaceViewProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const { product, originalProductId, canonicalProductId, originResearchMode, originView } = context;

  const evaluation =
    providedEvaluation ??
    evaluateProductOpportunity(product, {
      salesWeightPct,
    });

  const displayName = isMy ? product.nameMy : product.name;
  const categoryLabel = getCategoryLabel(product.category, language);
  const originModeLabel = getOriginModeLabel(originResearchMode, language);
  const hasVerifiedImage = Boolean(product.imageUrl && product.imageVerified !== false);

  const selectedCount = workspaceState.selectedIds.length;
  const totalCount = DEEP_DIVE_ANALYSIS_OPTIONS.length;
  const allSelected = selectedCount === totalCount;
  const canRun = canRunDeepDiveSelection(workspaceState);

  const selectedOptionNames = workspaceState.selectedIds
    .map((id) => {
      const def = getDeepDiveOptionById(id);
      return def ? (isMy ? def.nameMy : def.nameEn) : id;
    });

  const backLabel =
    originView === 'saved'
      ? isMy
        ? 'သိမ်းထားသော Product များသို့ ပြန်သွားမည်'
        : 'Back to Saved Products'
      : originView === 'history'
        ? isMy
          ? 'Research History သို့ ပြန်သွားမည်'
          : 'Back to Research History'
        : isMy
          ? 'Research Results သို့ ပြန်သွားမည်'
          : 'Back to Research Results';

  const copy = isMy
    ? {
        heading: 'Deep Dive Analysis',
        subheading: 'ရွေးချယ်ထားသော Product ကို သီးခြားအသေးစိတ် စစ်ဆေးရန် Foundation Workspace',
        infoTitle: 'Deep Dive Analysis အကြောင်း',
        infoBody:
          'Deep Dive သည် Research Mode အသစ်တစ်ခု မဟုတ်ပါ။ Fast / Balanced / Deep Research မှ ရှာဖွေပြီးသား Product ကို ကိုယ်တိုင်ရွေးချယ်ပြီး လိုအပ်သော Analysis များကိုသာ သီးခြားစစ်ဆေးနိုင်ရန် တည်ဆောက်ထားပါသည်။ မူရင်း Research Results၊ Ranking နှင့် Product Data များကို လုံးဝ မပြောင်းလဲပါ။ Phase 9.1 တွင် API ခေါ်ယူမှုနှင့် Credit သုံးစွဲမှု လုံးဝ မရှိပါ။',
        openDetailBtn: 'Product Detail ကြည့်ရန်',
        productIdLabel: 'Product ID',
        originModeLabel: 'မူရင်း Research Mode',
        priceLabel: 'ဈေးနှုန်း',
        commissionLabel: 'ကော်မရှင်',
        scoreLabel: '7-Factor Score',
        selectionHeading: 'Deep Dive Analysis ၈ မျိုး (ကိုယ်တိုင်ရွေးချယ်ရန်)',
        selectedCounter: (count: number, total: number) => `${total} ခုထဲမှ ${count} ခု ရွေးချယ်ထားသည်`,
        selectAllBtn: 'အားလုံးရွေးမည်',
        clearAllBtn: 'အားလုံးဖြုတ်မည်',
        selectedListLabel: 'ရွေးချယ်ထားသည်များ',
        noneSelectedHint: 'စစ်ဆေးလိုသော Analysis အနည်းဆုံး ၁ ခုကို ရွေးချယ်ပေးပါ။',
        statusSelected: 'ရွေးထားသည်',
        statusNotSelected: 'မရွေးရသေး',
        detailsExpand: 'အသေးစိတ်',
        detailsCollapse: 'ပိတ်မည်',
        highCostTag: 'ရွေးချယ်မှသာ Review API ခေါ်မည်',
        disclosureLabels: {
          whatItDoes: '၁။ ဒီ Analysis က ဘာလုပ်ပေးနိုင်သလဲ',
          whatItChecks: '၂။ စစ်ဆေးမည့် အချက်အလက်များ',
          expectedOutcome: '၃။ ရရှိမည့် ရလဒ်',
          requiredSources: '၄။ လိုအပ်နိုင်သည့် Data Source / API များ',
          estimatedCost: '၅။ ခန့်မှန်းကုန်ကျစရိတ်နှင့် Credit သုံးစွဲမှု',
          missingData: '၆။ Data မရရှိနိုင်သည့်အခါ ဖော်ပြပုံ',
        },
        slotLabel: 'Execution Module',
        notImplementedLabel: 'Not Implemented Yet',
        runBtn: (count: number) =>
          count > 0
            ? `ရွေးထားသည့် Analysis (${count}) ခုကို Run မည်`
            : 'Analysis ရွေးချယ်ပြီးမှ Run နိုင်မည်',
        runDisabledHint: 'Run လုပ်ရန် Analysis အနည်းဆုံး ၁ ခုကို အရင်ရွေးချယ်ပါ။',
        runFoundationNote:
          'Phase 9.1 (Foundation) — API Call 0 ကြိမ် · Credit 0 cr · Phase 9.2 တွင် Analysis Engine ချိတ်ဆက်ပါမည်။',
        attemptHeading: 'Phase 9.1 Foundation — Not Implemented Yet',
        attemptSubtext:
          'အောက်ပါ ရွေးချယ်ထားသည့် Analysis Module များသည် Phase 9.2 Analysis Engine အတွက် သီးခြား Identity ဖြင့် အဆင်သင့်ဖြစ်နေပါပြီ။ ဤအဆင့်တွင် မည်သည့် API မျှ မခေါ်ထားပါ (0 cr) — Fake Result မပြသပါ။',
      }
    : {
        heading: 'Deep Dive Analysis',
        subheading: 'On-demand single-product inspection workspace (Phase 9.1 Foundation)',
        infoTitle: 'About Deep Dive Analysis',
        infoBody:
          'Deep Dive is not a new Research Mode. It lets you manually select any product from Fast, Balanced, or Deep Research and choose only the specific analyses you want. Original Research Results, Rankings, and Product Data remain untouched. Phase 9.1 makes zero API calls and spends zero credits.',
        openDetailBtn: 'Open Product Detail',
        productIdLabel: 'Product ID',
        originModeLabel: 'Origin Mode',
        priceLabel: 'Price',
        commissionLabel: 'Commission',
        scoreLabel: '7-Factor Score',
        selectionHeading: '8 Deep Dive Analysis Modules (Manual Selection)',
        selectedCounter: (count: number, total: number) => `${count} of ${total} selected`,
        selectAllBtn: 'Select All',
        clearAllBtn: 'Clear All',
        selectedListLabel: 'Selected',
        noneSelectedHint: 'Select at least 1 analysis option below to enable execution.',
        statusSelected: 'Selected',
        statusNotSelected: 'Not Selected',
        detailsExpand: 'Details',
        detailsCollapse: 'Hide',
        highCostTag: 'Opt-in Review API only',
        disclosureLabels: {
          whatItDoes: '1. What this analysis does',
          whatItChecks: '2. Data points checked',
          expectedOutcome: '3. Expected result',
          requiredSources: '4. Required Data Sources / APIs',
          estimatedCost: '5. Estimated cost & credit guidance',
          missingData: '6. Missing or unavailable data policy',
        },
        slotLabel: 'Execution Module',
        notImplementedLabel: 'Not Implemented Yet',
        runBtn: (count: number) =>
          count > 0 ? `Run Selected Deep Dive (${count})` : 'Select Options to Run',
        runDisabledHint: 'Select at least 1 analysis option before running.',
        runFoundationNote:
          'Phase 9.1 Foundation — 0 API calls · 0 credits used · Execution engine arrives in Phase 9.2.',
        attemptHeading: 'Phase 9.1 Foundation — Not Implemented Yet',
        attemptSubtext:
          'Your selected modules are registered with isolated Phase 9.2 execution identities below. Zero API calls were triggered, 0 credits were spent, and no fake results are displayed.',
      };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Heading Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer py-1"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{backLabel}</span>
        </button>

        <button
          type="button"
          onClick={onOpenProductDetail}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer py-1 whitespace-nowrap"
        >
          <span>{copy.openDetailBtn}</span>
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        </button>
      </div>

      {/* Workspace Title */}
      <section className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 leading-[1.2]">
            {copy.heading}
          </h1>
          <InfoPopover
            variant="info"
            label={copy.infoTitle}
            title={copy.infoTitle}
            content={copy.infoBody}
          />
        </div>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          {copy.subheading}
        </p>
      </section>

      {/* Connected Read-Only Product Context Card */}
      <section
        aria-label={displayName}
        className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 sm:p-5"
      >
        <div className="flex flex-col sm:flex-row items-start gap-4">
          {/* Thumbnail */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0">
            {hasVerifiedImage && product.imageUrl ? (
              <ProductImage
                src={product.imageUrl}
                fallbackSrc={product.imageOriginUrl}
                alt={product.name}
                title={displayName}
                unavailableLabel={t.cardImageUnverified}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageOff className="w-5 h-5 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
              </div>
            )}
          </div>

          {/* Product Metadata (Read-Only Snapshot — Unboxed Zero-Pill Style) */}
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{categoryLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {copy.originModeLabel}: {originModeLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {copy.productIdLabel}: {canonicalProductId}
                </span>
                {originalProductId !== canonicalProductId && (
                  <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                    ({originalProductId})
                  </span>
                )}
              </div>

              <h2 className="font-display text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                {displayName}
              </h2>
            </div>

            <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/70 text-xs">
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{copy.priceLabel}</dt>
                <dd className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                  {product.priceThb !== null ? formatThb(product.priceThb) : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {copy.commissionLabel}
                </dt>
                <dd className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                  {product.commissionRate !== null
                    ? `${product.commissionRate}%`
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{copy.scoreLabel}</dt>
                <dd className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                  {evaluation.totalScore}/100
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* Manual Selection Controls & Live Selection Summary */}
      <section
        aria-labelledby="deep-dive-selection-heading"
        className="space-y-4"
      >
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Layers className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
                <h2
                  id="deep-dive-selection-heading"
                  className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50"
                >
                  {copy.selectionHeading}
                </h2>
              </div>
              <p className="font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                {copy.selectedCounter(selectedCount, totalCount)}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onSelectAll}
                disabled={allSelected}
                className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50 disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
              >
                {copy.selectAllBtn}
              </button>
              <button
                type="button"
                onClick={onClearAll}
                disabled={selectedCount === 0}
                className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50 disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
              >
                {copy.clearAllBtn}
              </button>
            </div>
          </div>

          {/* Selected Option Names Strip (Clean unboxed text separated by ·) */}
          <div className="pt-2.5 border-t border-zinc-100 dark:border-zinc-800/70 text-xs leading-relaxed">
            {selectedOptionNames.length > 0 ? (
              <div className="text-zinc-700 dark:text-zinc-300">
                <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {copy.selectedListLabel} ({selectedCount}):
                </span>{' '}
                <span>{selectedOptionNames.join(' · ')}</span>
              </div>
            ) : (
              <p className="text-zinc-500 dark:text-zinc-400">{copy.noneSelectedHint}</p>
            )}
          </div>
        </div>

        {/* 8 Independent Deep Dive Analysis Option Cards (Collapsed by Default) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start">
          {DEEP_DIVE_ANALYSIS_OPTIONS.map((option) => {
            const isSelected = workspaceState.selectedIds.includes(option.id);
            const isExpanded = workspaceState.expandedIds.includes(option.id);
            const slot = workspaceState.slots[option.id];
            const name = isMy ? option.nameMy : option.nameEn;
            const shortDesc = isMy ? option.shortDescriptionMy : option.shortDescriptionEn;
            const whatItDoes = isMy ? option.whatItDoesMy : option.whatItDoesEn;
            const whatItChecks = isMy ? option.whatItChecksMy : option.whatItChecksEn;
            const expectedOutcome = isMy ? option.expectedOutcomeMy : option.expectedOutcomeEn;
            const requiredSources = isMy
              ? option.requiredDataSourcesMy
              : option.requiredDataSourcesEn;
            const estimatedCost = isMy ? option.estimatedCostNoteMy : option.estimatedCostNoteEn;
            const missingData = isMy
              ? option.missingDataBehaviorMy
              : option.missingDataBehaviorEn;

            return (
              <article
                key={option.id}
                data-analysis-id={option.id}
                className={`bg-white dark:bg-zinc-900 border rounded-xl overflow-hidden transition-colors ${
                  isSelected
                    ? 'border-zinc-900 dark:border-zinc-200'
                    : 'border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                {/* Default Compact Visible Area */}
                <div className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    {/* Selection Checkbox + Name (Clicking checkbox or label toggles selection ONLY) */}
                    <label
                      htmlFor={`deep-dive-opt-${option.id}`}
                      className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer select-none"
                    >
                      <input
                        id={`deep-dive-opt-${option.id}`}
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleOption(option.id)}
                        className="mt-1 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 accent-zinc-950 dark:accent-zinc-100 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                            0{option.order}.
                          </span>
                          <span className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                            {name}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          {shortDesc}
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Compact Status & Independent Progressive Disclosure Trigger Row */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/70 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${
                          isSelected
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-zinc-400 dark:text-zinc-500'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                        <span>{isSelected ? copy.statusSelected : copy.statusNotSelected}</span>
                      </span>

                      {option.costSensitivity === 'high' && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            {copy.highCostTag}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Independent Expand / Collapse Trigger (Never alters selection!) */}
                    <button
                      type="button"
                      onClick={() => onToggleExpand(option.id)}
                      aria-expanded={isExpanded}
                      aria-controls={`deep-dive-details-${option.id}`}
                      className="inline-flex items-center gap-1 min-h-[30px] px-2 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>{isExpanded ? copy.detailsCollapse : copy.detailsExpand}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Progressive Disclosure Expanded Details (All 6 Required Sections) */}
                {isExpanded && (
                  <div
                    id={`deep-dive-details-${option.id}`}
                    className="px-4 pb-4 pt-3.5 border-t border-zinc-100 dark:border-zinc-800/70 bg-zinc-50/70 dark:bg-zinc-800/40 space-y-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {copy.disclosureLabels.whatItDoes}
                      </div>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        {whatItDoes}
                      </p>
                    </div>

                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {copy.disclosureLabels.whatItChecks}
                      </div>
                      <ul className="mt-1 space-y-1 text-zinc-600 dark:text-zinc-300 list-disc pl-4">
                        {whatItChecks.map((point) => (
                          <li key={point} className="leading-relaxed">
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {copy.disclosureLabels.expectedOutcome}
                      </div>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        {expectedOutcome}
                      </p>
                    </div>

                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {copy.disclosureLabels.requiredSources}
                      </div>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        {requiredSources}
                      </p>
                    </div>

                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {copy.disclosureLabels.estimatedCost}
                      </div>
                      <p
                        className={`mt-1 leading-relaxed ${
                          option.costSensitivity === 'high'
                            ? 'text-amber-800 dark:text-amber-300 font-medium'
                            : 'text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        {estimatedCost}
                      </p>
                    </div>

                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {copy.disclosureLabels.missingData}
                      </div>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        {missingData}
                      </p>
                    </div>

                    {/* Phase 9.2 Independent Execution Slot Metadata */}
                    <div className="pt-2.5 border-t border-zinc-200/80 dark:border-zinc-700/70 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono text-zinc-500 dark:text-zinc-400">
                        {copy.slotLabel}: {slot.analysisId}
                      </span>
                      <span className="font-mono font-medium text-amber-700 dark:text-amber-400">
                        {copy.notImplementedLabel}
                      </span>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* Execution Foundation Bar (Phase 9.1 — Zero API Calls, Honest Not-Implemented Status) */}
      <section
        aria-label="Deep Dive execution foundation"
        className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
              {canRun ? copy.selectedCounter(selectedCount, totalCount) : copy.runDisabledHint}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {copy.runFoundationNote}
            </p>
          </div>

          <button
            type="button"
            onClick={onRunSelected}
            disabled={!canRun}
            className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 w-full sm:w-auto"
          >
            <Play className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{copy.runBtn(selectedCount)}</span>
          </button>
        </div>

        {/* Honest Per-Module Not Implemented Yet Status Output (No Fake Results, 0 API Calls) */}
        {workspaceState.lastAttemptedRunIds.length > 0 && (
          <div
            role="status"
            className="pt-4 border-t border-zinc-100 dark:border-zinc-800/70 space-y-2.5"
          >
            <div className="flex items-start gap-2 text-xs">
              <AlertCircle
                className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {copy.attemptHeading}
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {copy.attemptSubtext}
                </p>
              </div>
            </div>

            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70 border border-zinc-200/80 dark:border-zinc-800 rounded-lg overflow-hidden">
              {workspaceState.lastAttemptedRunIds.map((id) => {
                const def = getDeepDiveOptionById(id);
                const slot = workspaceState.slots[id];
                if (!def || !slot) return null;
                return (
                  <div
                    key={id}
                    className="px-3.5 py-2.5 bg-zinc-50/70 dark:bg-zinc-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 mr-1.5 tabular-nums">
                        0{def.order}.
                      </span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {isMy ? def.nameMy : def.nameEn}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 ml-2">
                        ({slot.analysisId})
                      </span>
                    </div>
                    <span className="font-mono text-[11px] font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap shrink-0">
                      {copy.notImplementedLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
