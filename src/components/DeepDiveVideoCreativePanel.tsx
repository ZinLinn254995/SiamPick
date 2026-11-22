import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Film,
  Hash,
  MessageSquarePlus,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Star,
  Video,
  Wand2,
  X,
} from 'lucide-react';
import type {
  DeepDiveAiVideoToolStyle,
  DeepDiveScriptScene,
  DeepDiveVideoCreativeBlueprint,
  DeepDiveVideoCreativeOptions,
  DeepDiveVideoCtaStyle,
  DeepDiveVideoFramework,
  DeepDiveVideoProductionStyle,
  DeepDiveVideoScriptLanguage,
  DeepDiveVideoSellingFocus,
  DeepDiveVideoTargetAudience,
  DeepDiveVideoTargetDuration,
  DeepDiveVideoTone,
} from '../types/deepDive';
import type { Language, ResearchProduct } from '../types/product';
import {
  buildSmartVideoCreativeTemplates,
  DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS,
  isSmartVideoCreativeTemplateActive,
  MAX_VIDEO_CREATIVE_SUGGESTION_CHARS,
  normalizeDeepDiveVideoCreativeOptions,
  type SmartVideoCreativeTemplate,
  VIDEO_CREATIVE_AI_TOOL_LABELS,
  VIDEO_CREATIVE_AUDIENCE_LABELS,
  VIDEO_CREATIVE_CTA_LABELS,
  VIDEO_CREATIVE_FOCUS_LABELS,
  VIDEO_CREATIVE_FRAMEWORK_LABELS,
  VIDEO_CREATIVE_LANGUAGE_LABELS,
  VIDEO_CREATIVE_STYLE_LABELS,
  VIDEO_CREATIVE_TONE_LABELS,
} from '../utils/deepDiveRegistry';
import { formatThb } from '../utils/format';

const SCRIPT_LANGUAGE_ORDER: readonly DeepDiveVideoScriptLanguage[] = [
  'th-with-my',
  'my',
  'my-th-mix',
  'th-with-en',
];

const PRODUCTION_STYLE_ORDER: readonly DeepDiveVideoProductionStyle[] = [
  'ugc-face',
  'faceless-hands',
  'ai-video',
  'unboxing-first-try',
  'voiceover-broll',
  'before-after-demo',
  'greenscreen-reaction',
];

const DURATION_ORDER: readonly DeepDiveVideoTargetDuration[] = [
  '7-12s',
  '15s',
  '30s',
  '45-60s',
  '60-90s',
];

const TONE_ORDER: readonly DeepDiveVideoTone[] = [
  'friendly-bestie',
  'urgent-deal',
  'expert-honest',
  'funny-relatable',
  'luxury-aesthetic',
];

const FRAMEWORK_ORDER: readonly DeepDiveVideoFramework[] = [
  'auto',
  'pas',
  'hook-demo-proof-cta',
  'storytelling',
  'objection-killer',
  'bundle-math',
];

const AUDIENCE_ORDER: readonly DeepDiveVideoTargetAudience[] = [
  'auto',
  'budget-hunters',
  'office-students',
  'moms-household',
  'beauty-selfcare',
  'myanmar-in-th',
];

const SELLING_FOCUS_ORDER: readonly DeepDiveVideoSellingFocus[] = [
  'price-bundle',
  'reviews-proof',
  'fast-convenience',
  'quality-ingredients',
  'daily-gift',
];

const CTA_STYLE_ORDER: readonly DeepDiveVideoCtaStyle[] = [
  'urgent-basket',
  'soft-recommend',
  'comment-engagement',
];

const AI_TOOL_ORDER: readonly DeepDiveAiVideoToolStyle[] = [
  'general-9-16',
  'veo-kling-cinematic',
  'heygen-avatar',
  'image-to-video',
];

const QUICK_SUGGESTION_PRESETS: ReadonlyArray<{
  id: string;
  labelEn: string;
  labelMy: string;
  textEn: string;
  textMy: string;
}> = [
  {
    id: 'bundle-value',
    labelEn: 'Emphasize Price / Bundle Deal',
    labelMy: 'ဈေးတန်မှု / Bundle အသားပေး',
    textEn: 'Emphasize the low price per unit / bundle value right in the opening 3 seconds.',
    textMy: 'ပထမ 3 စက္ကန့်အတွင်း ဈေးတန်မှုနှင့် တစ်ခုကျသင့်ငွေ/Bundle တန်ဖိုးကို အဓိကအသားပေးပြောပေးပါ။',
  },
  {
    id: 'one-phone-easy',
    labelEn: 'Easy 1-Phone Home Shoot',
    labelMy: 'ဖုန်း 1 လုံးတည်း အိမ်တွင်းရိုက်လွယ်',
    textEn: 'Keep every shot simple enough to film alone at home with 1 smartphone and window light.',
    textMy: 'အိမ်တွင်းသဘာဝအလင်းရောင်နှင့် ဖုန်းတစ်လုံးတည်း တစ်ယောက်တည်းရိုက်ရလွယ်မည့် Shot များသာ ထည့်ပေးပါ။',
  },
  {
    id: 'spark-ads-safe',
    labelEn: '100% Spark Ads Policy-Safe',
    labelMy: 'Spark Ads Policy 100% ဘေးကင်း',
    textEn: 'Make script 100% TikTok Spark Ads compliant with zero medical claims or exaggerated guarantees.',
    textMy: 'TikTok Spark Ads Boost တင်ရန်အတွက် စည်းကမ်းမငြိဘဲ 100% Policy ဘေးကင်းသည့် စကားလုံးများသာ သုံးပေးပါ။',
  },
  {
    id: 'myanmar-buyer',
    labelEn: 'Myanmar Community in TH',
    labelMy: 'ထိုင်းရောက်မြန်မာဝယ်သူအကြိုက်',
    textEn: 'Write in warm, relatable style tailored for Myanmar shoppers living in Thailand who buy on TikTok Shop.',
    textMy: 'ထိုင်းရောက်မြန်မာဝယ်သူများ ရင်းရင်းနှီးနှီးနားလည်ပြီး ချက်ချင်းဝယ်ချင်လာအောင် ပြောဟန်ထည့်ပေးပါ။',
  },
];

interface VideoCreativeConfigBarProps {
  product?: ResearchProduct | null;
  options: DeepDiveVideoCreativeOptions;
  disabled?: boolean;
  onChange: (next: DeepDiveVideoCreativeOptions) => void;
  language: Language;
}

export function VideoCreativeConfigBar({
  product,
  options,
  disabled = false,
  onChange,
  language,
}: VideoCreativeConfigBarProps) {
  const isMy = language === 'my';
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);

  const smartTemplates = useMemo(
    () => buildSmartVideoCreativeTemplates(product),
    [product]
  );

  const normalized = normalizeDeepDiveVideoCreativeOptions(options);
  const sellingFocuses = normalized.sellingFocuses ?? [];
  const suggestionText = options.customSuggestion ?? '';
  const suggestionLen = suggestionText.length;

  const isNonDefault =
    normalized.includeCompetitorVideos !== DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.includeCompetitorVideos ||
    normalized.scriptLanguage !== DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.scriptLanguage ||
    normalized.videoStyle !== DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.videoStyle ||
    normalized.duration !== DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.duration ||
    normalized.tone !== DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.tone ||
    normalized.framework !== DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.framework ||
    normalized.targetAudience !== DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.targetAudience ||
    normalized.ctaStyle !== DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.ctaStyle ||
    normalized.aiVideoTool !== DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.aiVideoTool ||
    sellingFocuses.length > 0 ||
    suggestionText.trim().length > 0 ||
    (options.customKeyword ?? '').trim().length > 0;

  const update = (patch: Partial<DeepDiveVideoCreativeOptions>) =>
    onChange({
      ...normalized,
      customSuggestion: options.customSuggestion,
      customKeyword: options.customKeyword,
      ...patch,
    });

  const toggleSellingFocus = (focus: DeepDiveVideoSellingFocus) => {
    const exists = sellingFocuses.includes(focus);
    const next = exists
      ? sellingFocuses.filter((item) => item !== focus)
      : [...sellingFocuses, focus];
    update({ sellingFocuses: next });
  };

  const appendQuickSuggestion = (text: string) => {
    const trimmedCurrent = suggestionText.trim();
    if (trimmedCurrent.includes(text)) return;
    const joined = trimmedCurrent ? `${trimmedCurrent} ${text}` : text;
    update({ customSuggestion: joined.slice(0, MAX_VIDEO_CREATIVE_SUGGESTION_CHARS) });
  };

  const handleApplyTemplate = (tpl: SmartVideoCreativeTemplate) => {
    update(tpl.patch);
    setAppliedTemplateId(tpl.id);
  };

  const handleReset = () => {
    setAppliedTemplateId(null);
    onChange({
      ...DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS,
      sellingFocuses: [],
      customSuggestion: '',
      customKeyword: '',
    });
  };

  const segBtn = (active: boolean) =>
    `min-h-[34px] sm:min-h-[30px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed ${
      active
        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950'
        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800'
    }`;

  const toneLabel = VIDEO_CREATIVE_TONE_LABELS[normalized.tone ?? 'friendly-bestie'];
  const frameworkLabel = VIDEO_CREATIVE_FRAMEWORK_LABELS[normalized.framework ?? 'auto'];
  const audienceLabel = VIDEO_CREATIVE_AUDIENCE_LABELS[normalized.targetAudience ?? 'auto'];
  const ctaLabel = VIDEO_CREATIVE_CTA_LABELS[normalized.ctaStyle ?? 'urgent-basket'];

  return (
    <div className="pt-2.5 border-t border-zinc-100 dark:border-zinc-800/70 space-y-3 text-xs">
      {/* Row 1: Optional Competitor Video Scan Toggle (+0.1 cr, 24h cached) + Reset */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex items-start gap-2 cursor-pointer select-none min-w-0 flex-1">
            <input
              type="checkbox"
              checked={normalized.includeCompetitorVideos}
              disabled={disabled}
              onChange={(e) => update({ includeCompetitorVideos: e.target.checked })}
              className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-700 accent-zinc-950 dark:accent-zinc-100 cursor-pointer shrink-0"
            />
            <span className="min-w-0 leading-snug">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {isMy
                  ? 'ပြိုင်ဘက် ရောင်းကောင်း Video များပါ စစ်ဆေးလေ့လာမည်'
                  : 'Scan Top-Selling Competitor Videos'}
              </span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {' · '}
                <span className="font-mono tabular-nums">
                  {normalized.includeCompetitorVideos
                    ? isMy
                      ? '+0.1 Kalodata cr (24h Cache)'
                      : '+0.1 Kalodata cr (24h cached)'
                    : isMy
                      ? 'ပိတ်ထားသည် (0 Kalodata cr)'
                      : 'OFF (0 Kalodata cr)'}
                </span>
              </span>
            </span>
          </label>

          {isNonDefault && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleReset}
              className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-45"
            >
              <RotateCcw className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>{isMy ? 'ပြန်ညှိမည်' : 'Reset'}</span>
            </button>
          )}
        </div>

        {normalized.includeCompetitorVideos && (
          <div className="pl-5 flex flex-col sm:flex-row sm:items-center gap-1.5 text-xs">
            <label
              htmlFor="deep-dive-video-custom-keyword"
              className="text-zinc-600 dark:text-zinc-400 whitespace-nowrap"
            >
              {isMy ? 'ရှာဖွေမည့် Keyword (မထည့်လည်းရ):' : 'Search Keyword (optional):'}
            </label>
            <input
              id="deep-dive-video-custom-keyword"
              type="text"
              value={options.customKeyword ?? ''}
              disabled={disabled}
              maxLength={80}
              onChange={(e) => update({ customKeyword: e.target.value })}
              placeholder={
                isMy
                  ? 'အလွတ်ထားပါက Product အမည်မှ အလိုအလျောက်ရှာမည်'
                  : 'Leave blank to auto-extract from product title'
              }
              className="flex-1 min-w-0 min-h-[40px] px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 disabled:opacity-45"
            />
          </div>
        )}
      </div>

      {/* Row 1.5: Smart Product-Aware Setting Templates (1-Click Apply · 0 cr local) */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/70 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
          <div className="inline-flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
            <Wand2 className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
            <span>
              {isMy
                ? 'ဒီကုန်ပစ္စည်းအတွက် အကြံပြု Setting Templates (1 ချက်နှိပ်ရွေး · 0 cr)'
                : 'Smart Setting Templates for This Product (1-Click · 0 cr)'}
            </span>
          </div>
          {appliedTemplateId && (
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {isMy
                ? 'Template ထည့်ပြီး · အောက်တွင် စိတ်ကြိုက်ပြန်ညှိနိုင်သည်'
                : 'Template applied · fine-tune any setting below'}
            </span>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-0.5 px-0.5 pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
          {smartTemplates.map((tpl) => {
            const isActive = isSmartVideoCreativeTemplateActive(normalized, tpl);
            return (
              <button
                key={tpl.id}
                type="button"
                disabled={disabled}
                onClick={() => handleApplyTemplate(tpl)}
                className={`min-w-[240px] max-w-[265px] sm:min-w-0 sm:max-w-none shrink-0 snap-start text-left p-2.5 rounded-lg border transition-colors cursor-pointer space-y-1 disabled:opacity-45 disabled:cursor-not-allowed ${
                  isActive
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-900 dark:border-zinc-100'
                    : 'bg-zinc-50/80 dark:bg-zinc-950/60 text-zinc-800 dark:text-zinc-200 border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-white dark:hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-xs leading-snug flex items-center gap-1 min-w-0">
                    {tpl.isRecommended && (
                      <Star
                        className={`w-3 h-3 shrink-0 ${
                          isActive
                            ? 'text-amber-300 dark:text-amber-600 fill-current'
                            : 'text-amber-500 fill-current'
                        }`}
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{isMy ? tpl.titleMy : tpl.titleEn}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {tpl.isRecommended && (
                      <span
                        className={`text-xs font-medium whitespace-nowrap ${
                          isActive
                            ? 'text-amber-200 dark:text-amber-700'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {isMy ? 'အသင့်တော်ဆုံး' : 'Best Fit'}
                      </span>
                    )}
                    {isActive && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                  </div>
                </div>
                <div
                  className={`text-xs font-medium leading-snug truncate ${
                    isActive
                      ? 'text-zinc-300 dark:text-zinc-700'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {isMy ? tpl.specMy : tpl.specEn}
                </div>
                <p
                  className={`text-xs leading-snug line-clamp-2 ${
                    isActive
                      ? 'text-zinc-200 dark:text-zinc-800'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {isMy ? tpl.reasonMy : tpl.reasonEn}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 2: Primary Creative Selectors (4 Languages · 7 Production Styles · 5 Lengths) */}
      <div className="space-y-2 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <span className="text-zinc-600 dark:text-zinc-400 font-medium sm:w-14 shrink-0">
            {isMy ? 'ဘာသာ:' : 'Script:'}
          </span>
          <div className="flex flex-wrap items-center gap-0.5 p-1 rounded-lg bg-zinc-100/90 dark:bg-zinc-800/80">
            {SCRIPT_LANGUAGE_ORDER.map((langKey) => (
              <button
                key={langKey}
                type="button"
                disabled={disabled}
                onClick={() => update({ scriptLanguage: langKey })}
                className={segBtn(normalized.scriptLanguage === langKey)}
              >
                {isMy
                  ? VIDEO_CREATIVE_LANGUAGE_LABELS[langKey].my
                  : VIDEO_CREATIVE_LANGUAGE_LABELS[langKey].en}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
          <span className="text-zinc-600 dark:text-zinc-400 font-medium sm:w-14 sm:pt-1.5 shrink-0">
            {isMy ? 'ပုံစံ:' : 'Style:'}
          </span>
          <div className="flex flex-wrap items-center gap-0.5 p-1 rounded-lg bg-zinc-100/90 dark:bg-zinc-800/80 flex-1 min-w-0">
            {PRODUCTION_STYLE_ORDER.map((styleKey) => (
              <button
                key={styleKey}
                type="button"
                disabled={disabled}
                onClick={() => update({ videoStyle: styleKey })}
                className={segBtn(normalized.videoStyle === styleKey)}
              >
                {isMy
                  ? VIDEO_CREATIVE_STYLE_LABELS[styleKey].my
                  : VIDEO_CREATIVE_STYLE_LABELS[styleKey].en}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <span className="text-zinc-600 dark:text-zinc-400 font-medium sm:w-14 shrink-0">
            {isMy ? 'အချိန်:' : 'Length:'}
          </span>
          <div className="flex flex-wrap items-center gap-0.5 p-1 rounded-lg bg-zinc-100/90 dark:bg-zinc-800/80">
            {DURATION_ORDER.map((dur) => (
              <button
                key={dur}
                type="button"
                disabled={disabled}
                onClick={() => update({ duration: dur })}
                className={segBtn(normalized.duration === dur)}
              >
                {dur}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Progressive Disclosure — Advanced Creative Controls (Tone · Framework · Audience · Focus · CTA · AI Tool) */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/70 space-y-2.5">
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          aria-expanded={showAdvanced}
          className="w-full min-h-[40px] py-1 flex items-center justify-between gap-2 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5 min-w-0 flex-wrap">
            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
            <span>
              {isMy ? 'ထပ်တိုးရွေးချယ်စရာများ (Tone · Framework · Audience · CTA)' : 'More Creative Options (Tone · Framework · Audience · CTA)'}
            </span>
            <span className="font-normal text-zinc-500 dark:text-zinc-400 truncate">
              · {isMy ? toneLabel.my : toneLabel.en} · {isMy ? frameworkLabel.my : frameworkLabel.en}
              {sellingFocuses.length > 0
                ? ` · ${isMy ? `Focus ${sellingFocuses.length}` : `${sellingFocuses.length} focuses`}`
                : ''}
            </span>
          </span>
          {showAdvanced ? (
            <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" aria-hidden="true" />
          )}
        </button>

        {showAdvanced && (
          <div className="p-3 rounded-lg sp-surface-muted border border-zinc-200/70 dark:border-zinc-800 space-y-2.5 text-xs">
            {/* Tone & Vibe */}
            <div className="space-y-1">
              <div className="font-medium text-zinc-600 dark:text-zinc-400">
                {isMy ? 'ပြောဆိုဟန် / လေသံ (Tone & Vibe)' : 'Tone & Delivery Vibe'}
              </div>
              <div className="flex flex-wrap gap-1">
                {TONE_ORDER.map((toneKey) => (
                  <button
                    key={toneKey}
                    type="button"
                    disabled={disabled}
                    onClick={() => update({ tone: toneKey })}
                    className={segBtn((normalized.tone ?? 'friendly-bestie') === toneKey)}
                  >
                    {isMy ? VIDEO_CREATIVE_TONE_LABELS[toneKey].my : VIDEO_CREATIVE_TONE_LABELS[toneKey].en}
                  </button>
                ))}
              </div>
            </div>

            {/* Script Framework */}
            <div className="space-y-1 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/70">
              <div className="font-medium text-zinc-600 dark:text-zinc-400">
                {isMy ? 'Script ဖွဲ့စည်းပုံ (Framework)' : 'Script Framework'}
              </div>
              <div className="flex flex-wrap gap-1">
                {FRAMEWORK_ORDER.map((fwKey) => (
                  <button
                    key={fwKey}
                    type="button"
                    disabled={disabled}
                    onClick={() => update({ framework: fwKey })}
                    className={segBtn((normalized.framework ?? 'auto') === fwKey)}
                  >
                    {isMy ? VIDEO_CREATIVE_FRAMEWORK_LABELS[fwKey].my : VIDEO_CREATIVE_FRAMEWORK_LABELS[fwKey].en}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Buyer Persona */}
            <div className="space-y-1 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/70">
              <div className="font-medium text-zinc-600 dark:text-zinc-400">
                {isMy ? 'ပစ်မှတ်ဝယ်သူအုပ်စု (Target Audience)' : 'Target Buyer Persona'}
              </div>
              <div className="flex flex-wrap gap-1">
                {AUDIENCE_ORDER.map((audKey) => (
                  <button
                    key={audKey}
                    type="button"
                    disabled={disabled}
                    onClick={() => update({ targetAudience: audKey })}
                    className={segBtn((normalized.targetAudience ?? 'auto') === audKey)}
                  >
                    {isMy ? VIDEO_CREATIVE_AUDIENCE_LABELS[audKey].my : VIDEO_CREATIVE_AUDIENCE_LABELS[audKey].en}
                  </button>
                ))}
              </div>
            </div>

            {/* Multi-select Selling Focuses */}
            <div className="space-y-1 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/70">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">
                  {isMy ? 'အသားပေးပြောလိုသည့်အချက်များ (အများရွေးနိုင်)' : 'Key Selling Focuses (Multi-select)'}
                </span>
                {sellingFocuses.length > 0 && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => update({ sellingFocuses: [] })}
                    className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                  >
                    {isMy ? 'ရှင်းမည်' : 'Clear'}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SELLING_FOCUS_ORDER.map((focusKey) => {
                  const selected = sellingFocuses.includes(focusKey);
                  return (
                    <button
                      key={focusKey}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleSellingFocus(focusKey)}
                      className={`inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap disabled:opacity-45 ${
                        selected
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-900 dark:border-zinc-100'
                          : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
                      }`}
                    >
                      {selected && <Check className="w-3 h-3 shrink-0" aria-hidden="true" />}
                      <span>
                        {isMy ? VIDEO_CREATIVE_FOCUS_LABELS[focusKey].my : VIDEO_CREATIVE_FOCUS_LABELS[focusKey].en}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CTA Style */}
            <div className="space-y-1 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/70">
              <div className="font-medium text-zinc-600 dark:text-zinc-400">
                {isMy ? 'အဆုံးသတ် CTA ပုံစံ' : 'Ending CTA Style'}
              </div>
              <div className="flex flex-wrap gap-1">
                {CTA_STYLE_ORDER.map((ctaKey) => (
                  <button
                    key={ctaKey}
                    type="button"
                    disabled={disabled}
                    onClick={() => update({ ctaStyle: ctaKey })}
                    className={segBtn((normalized.ctaStyle ?? 'urgent-basket') === ctaKey)}
                  >
                    {isMy ? VIDEO_CREATIVE_CTA_LABELS[ctaKey].my : VIDEO_CREATIVE_CTA_LABELS[ctaKey].en}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Video Prompt Tool Style (Only shown when AI Video style is selected) */}
            {normalized.videoStyle === 'ai-video' && (
              <div className="space-y-1 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/70">
                <div className="font-medium text-zinc-600 dark:text-zinc-400">
                  {isMy ? 'AI Video Prompt Tool ပုံစံ' : 'AI Video Tool Prompt Format'}
                </div>
                <div className="flex flex-wrap gap-1">
                  {AI_TOOL_ORDER.map((toolKey) => (
                    <button
                      key={toolKey}
                      type="button"
                      disabled={disabled}
                      onClick={() => update({ aiVideoTool: toolKey })}
                      className={segBtn((normalized.aiVideoTool ?? 'general-9-16') === toolKey)}
                    >
                      {isMy ? VIDEO_CREATIVE_AI_TOOL_LABELS[toolKey].my : VIDEO_CREATIVE_AI_TOOL_LABELS[toolKey].en}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {isMy
                ? `လက်ရှိရွေးချယ်မှု: ${audienceLabel.my} · ${ctaLabel.my}`
                : `Active: ${audienceLabel.en} · ${ctaLabel.en}`}
            </div>
          </div>
        )}
      </div>

      {/* Row 4: Custom Suggestion / Creative Brief Box for Direct AI Instructions */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/70 space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <label
            htmlFor="deep-dive-video-suggestion-box"
            className="inline-flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200"
          >
            <MessageSquarePlus className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
            <span>
              {isMy
                ? 'AI ကို ကိုယ်တိုင်ညွှန်ကြားရန် (Suggestion Box · မထည့်လည်းရ)'
                : 'Custom Suggestion / Brief to AI (Optional)'}
            </span>
          </label>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              {suggestionLen}/{MAX_VIDEO_CREATIVE_SUGGESTION_CHARS}
            </span>
            {suggestionLen > 0 && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => update({ customSuggestion: '' })}
                aria-label={isMy ? 'စာရှင်းမည်' : 'Clear suggestion'}
                className="inline-flex items-center gap-0.5 min-h-[32px] px-2 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md cursor-pointer disabled:opacity-45"
              >
                <X className="w-3 h-3" aria-hidden="true" />
                <span>{isMy ? 'ရှင်း' : 'Clear'}</span>
              </button>
            )}
          </div>
        </div>

        <textarea
          id="deep-dive-video-suggestion-box"
          rows={2}
          maxLength={MAX_VIDEO_CREATIVE_SUGGESTION_CHARS}
          value={suggestionText}
          disabled={disabled}
          onChange={(e) => update({ customSuggestion: e.target.value })}
          placeholder={
            isMy
              ? 'ဥပမာ — “1แถม2 ဈေးတန်မှုကို အသားပေးပြောပေးပါ၊ အိမ်မီးရောင်နဲ့ ဖုန်းတစ်လုံးတည်း ရိုက်ရလွယ်အောင်၊ စကားပြောက ရင်းရင်းနှီးနှီးဖြစ်ပါစေ” (မြန်မာ / ထိုင်း / English ကြိုက်ရာရေးနိုင်သည်)'
              : 'e.g., "Focus on 1-get-2 bundle math, easy to film with 1 phone at home, friendly bestie tone, avoid medical claims" (EN / MY / TH)'
          }
          className="w-full px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 resize-y leading-relaxed disabled:opacity-45"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
            {isMy ? 'အမြန်ထည့်ရန်:' : 'Quick add:'}
          </span>
          {QUICK_SUGGESTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => appendQuickSuggestion(isMy ? preset.textMy : preset.textEn)}
              className="min-h-[32px] px-2.5 py-1 text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-100/90 dark:bg-zinc-800/90 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-45"
            >
              + {isMy ? preset.labelMy : preset.labelEn}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type CreativeTab = 'all' | 'competitors' | 'concepts' | 'script' | 'seo' | 'policy';

interface DeepDiveVideoCreativePanelProps {
  blueprint: DeepDiveVideoCreativeBlueprint;
  language: Language;
  onApplyConceptToBrief?: (suggestionText: string) => void;
}

export function DeepDiveVideoCreativePanel({
  blueprint,
  language,
  onApplyConceptToBrief,
}: DeepDiveVideoCreativePanelProps) {
  const isMy = language === 'my';
  const [activeTab, setActiveTab] = useState<CreativeTab>('all');
  const [selectedHookIndex, setSelectedHookIndex] = useState<number>(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Reset hook selection when a freshly generated blueprint arrives
  useEffect(() => {
    setSelectedHookIndex(0);
  }, [blueprint.generatedAt]);

  const safeHookIndex =
    blueprint.hooks.length > 0
      ? Math.min(Math.max(0, selectedHookIndex), blueprint.hooks.length - 1)
      : 0;
  const activeHook = blueprint.hooks[safeHookIndex] ?? null;

  // Build effective scenes where Scene 1 (0-3s) swaps dynamically to the chosen Hook (#1..#5)
  // while Scenes 2..N stay intact as the shared Body + CTA (Modular Hook A/B Testing — 0 extra cr!)
  const effectiveScenes: DeepDiveScriptScene[] = blueprint.scriptScenes.map((scene, idx) => {
    if (idx !== 0 || !activeHook) return scene;
    return {
      ...scene,
      phaseLabel: `Hook #${safeHookIndex + 1} · ${activeHook.hookType}`,
      voiceover: activeHook.hookText,
      voiceoverMy: activeHook.meaningMy,
      onScreenText: activeHook.onScreenText || scene.onScreenText,
      shotDirectionEn: activeHook.visualActionEn || scene.shotDirectionEn,
      shotDirectionMy: activeHook.visualActionMy || scene.shotDirectionMy,
      aiVideoPromptEn: activeHook.aiVideoPromptEn ?? scene.aiVideoPromptEn,
    };
  });

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1600);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const renderCopyBtn = (key: string, text: string, labelEn = 'Copy', labelMy = 'ကူးရန်') => {
    const isCopied = copiedKey === key;
    return (
      <button
        type="button"
        onClick={() => void copyText(key, text)}
        className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        {isCopied ? (
          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
        ) : (
          <Copy className="w-3 h-3 shrink-0" aria-hidden="true" />
        )}
        <span>{isCopied ? (isMy ? 'ကူးပြီး' : 'Copied') : isMy ? labelMy : labelEn}</span>
      </button>
    );
  };

  const formatSceneBlock = (scene: DeepDiveScriptScene) =>
    [
      `[${scene.timeRange}] ${scene.phaseLabel}`,
      `VO: ${scene.voiceover}`,
      scene.voiceoverMy ? `Note/MY: ${scene.voiceoverMy}` : '',
      scene.onScreenText ? `Text: ${scene.onScreenText}` : '',
      `Shot: ${isMy ? scene.shotDirectionMy : scene.shotDirectionEn}`,
      scene.aiVideoPromptEn ? `AI Prompt: ${scene.aiVideoPromptEn}` : '',
    ]
      .filter(Boolean)
      .join('\n');

  const fullScriptClipboardText = [
    `${blueprint.scriptTitle} (${blueprint.optionsUsed.duration} · Hook #${safeHookIndex + 1})`,
    '',
    ...effectiveScenes.map(formatSceneBlock),
  ].join('\n\n');

  const abTestPackClipboardText = [
    `${blueprint.scriptTitle} — 5-Hook Modular A/B Test Pack (${blueprint.optionsUsed.duration})`,
    '',
    '=== PART A: 5 OPENING HOOKS (Film 5 x 3-sec clips for Scene 1) ===',
    ...blueprint.hooks.map((hook, idx) =>
      [
        `Hook #${idx + 1} (${hook.hookType}): ${hook.hookText}`,
        hook.meaningMy ? `MY: ${hook.meaningMy}` : '',
        hook.onScreenText ? `Overlay: ${hook.onScreenText}` : '',
        `Visual (0-3s): ${isMy ? hook.visualActionMy : hook.visualActionEn}`,
        hook.aiVideoPromptEn ? `AI Prompt: ${hook.aiVideoPromptEn}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    ),
    '',
    '=== PART B: SHARED BODY & CTA (Film ONCE, attach after each Hook #1-#5 in CapCut) ===',
    ...blueprint.scriptScenes.slice(1).map(formatSceneBlock),
  ].join('\n\n');

  const allAiPromptsText = effectiveScenes
    .filter((s) => Boolean(s.aiVideoPromptEn))
    .map((s) => `Scene ${s.sceneNumber} (${s.timeRange} - ${s.phaseLabel}):\n${s.aiVideoPromptEn}`)
    .join('\n\n');

  const allHashtags = [
    ...blueprint.seoPack.hashtagsBroad,
    ...blueprint.seoPack.hashtagsNiche,
    ...blueprint.seoPack.hashtagsBuyerIntent,
  ];
  const allHashtagsText = allHashtags.join(' ');
  const allKeywordsText = blueprint.seoPack.searchKeywords.join(', ');

  const tabs: Array<{ id: CreativeTab; labelEn: string; labelMy: string }> = [
    { id: 'all', labelEn: 'All', labelMy: 'အားလုံး' },
    { id: 'competitors', labelEn: 'Competitor Study', labelMy: 'ပြိုင်ဘက်လေ့လာချက်' },
    { id: 'concepts', labelEn: 'Concepts & Hooks', labelMy: 'Concept နှင့် Hook' },
    { id: 'script', labelEn: 'Shooting Script', labelMy: 'Script အပြည့်' },
    { id: 'seo', labelEn: 'TikTok SEO Pack', labelMy: 'SEO & Hashtag' },
    { id: 'policy', labelEn: 'Policy Guard', labelMy: 'စည်းကမ်းသတိပေး' },
  ];

  const showSection = (tab: CreativeTab) => activeTab === 'all' || activeTab === tab;

  const opts = normalizeDeepDiveVideoCreativeOptions(blueprint.optionsUsed);
  const specSummaryParts = [
    isMy
      ? VIDEO_CREATIVE_STYLE_LABELS[opts.videoStyle]?.my
      : VIDEO_CREATIVE_STYLE_LABELS[opts.videoStyle]?.en,
    opts.duration,
    isMy
      ? VIDEO_CREATIVE_LANGUAGE_LABELS[opts.scriptLanguage]?.my
      : VIDEO_CREATIVE_LANGUAGE_LABELS[opts.scriptLanguage]?.en,
    opts.tone
      ? isMy
        ? VIDEO_CREATIVE_TONE_LABELS[opts.tone]?.my
        : VIDEO_CREATIVE_TONE_LABELS[opts.tone]?.en
      : null,
    opts.framework && opts.framework !== 'auto'
      ? isMy
        ? VIDEO_CREATIVE_FRAMEWORK_LABELS[opts.framework]?.my
        : VIDEO_CREATIVE_FRAMEWORK_LABELS[opts.framework]?.en
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4 text-xs">
      {/* Applied Settings & Custom Brief Strip */}
      <div className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800/80 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {isMy ? 'သုံးထားသော Settings:' : 'Generated with:'}
          </span>
          <span>{specSummaryParts.join(' · ')}</span>
        </div>
        {blueprint.optionsUsed.customSuggestion && (
          <div className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
            <span className="font-medium text-zinc-800 dark:text-zinc-100">
              {isMy ? 'ကိုယ်တိုင်ညွှန်ကြားချက်: ' : 'Custom Brief: '}
            </span>
            “{blueprint.optionsUsed.customSuggestion}”
          </div>
        )}
      </div>

      {/* Compact Section Filter Bar (horizontally scrollable on mobile) */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar sm:flex-wrap pt-2 border-t border-zinc-200/70 dark:border-zinc-800/80">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {isMy ? tab.labelMy : tab.labelEn}
            </button>
          );
        })}
      </div>

      {/* 1. Competitor Winning Videos & AI Teardown */}
      {showSection('competitors') && (
        <div className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/80 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
              <Video className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
              <span>
                {isMy
                  ? '1. ပြိုင်ဘက် ရောင်းကောင်း Video များနှင့် AI လေ့လာချက်'
                  : '1. Competitor Winning Videos & AI Teardown'}
              </span>
            </div>
            <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              {blueprint.competitorScanStatus === 'scanned'
                ? isMy
                  ? `Video ${blueprint.competitorVideos.length} ခု (${blueprint.competitorKeywordUsed ?? ''})`
                  : `${blueprint.competitorVideos.length} videos (${blueprint.competitorKeywordUsed ?? ''})`
                : blueprint.competitorScanStatus === 'no-videos-found'
                  ? isMy
                    ? 'Video 0 ခု'
                    : '0 videos found'
                  : isMy
                    ? '0 cr Mode (မစစ်ဆေးထားပါ)'
                    : '0 cr mode (Scan OFF)'}
            </span>
          </div>

          {blueprint.competitorVideos.length > 0 && (
            <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 border border-zinc-200/70 dark:border-zinc-800/80 rounded-lg overflow-hidden sp-surface-muted">
              {blueprint.competitorVideos.map((vid) => (
                <div key={vid.videoId} className="p-2.5 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-zinc-800 dark:text-zinc-200 leading-snug line-clamp-2">
                      {vid.caption}
                    </p>
                    <a
                      href={vid.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 shrink-0 whitespace-nowrap"
                    >
                      <span>{isMy ? 'TikTok ကြည့်ရန်' : 'Watch'}</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                    {vid.creatorHandle && <span>@{vid.creatorHandle.replace(/^@+/, '')}</span>}
                    {vid.revenueThb !== null && (
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        GMV {formatThb(vid.revenueThb)}
                      </span>
                    )}
                    {vid.salesVolume !== null && (
                      <span>{vid.salesVolume.toLocaleString('en-US')} sold</span>
                    )}
                    {vid.views !== null && (
                      <span>{vid.views.toLocaleString('en-US')} views</span>
                    )}
                    {vid.durationSec !== null && <span>{vid.durationSec}s</span>}
                  </div>
                  {vid.hashtags.length > 0 && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {vid.hashtags.slice(0, 6).join(' ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Winning Patterns & Creative Differentiation Gap */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                {isMy ? 'အောင်မြင်နေသော Pattern များ' : 'Winning Creative Patterns'}
              </div>
              <ul className="space-y-1 text-zinc-600 dark:text-zinc-300 list-disc pl-4">
                {(isMy ? blueprint.winningPatternsMy : blueprint.winningPatternsEn).map(
                  (pat, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {pat}
                    </li>
                  )
                )}
              </ul>
            </div>

            <div className="space-y-1">
              <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                {isMy ? 'ကိုယ်ဖောက်ထွက်နိုင်မည့် Creative Gap' : 'Creative Gap to Stand Out'}
              </div>
              <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {isMy ? blueprint.creativeGapMy : blueprint.creativeGapEn}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. 3 Winning Video Concepts + 5 Modular 3-Second Hooks */}
      {showSection('concepts') && (
        <div className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/80 space-y-3.5">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
              <Film className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
              <span>
                {isMy
                  ? `2. AI Content Video Concept ${blueprint.concepts.length} မျိုး`
                  : `2. ${blueprint.concepts.length} Winning Ad Video Concepts`}
              </span>
            </div>

            <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 border border-zinc-200/70 dark:border-zinc-800/80 rounded-lg sp-surface-muted">
              {blueprint.concepts.map((concept, idx) => (
                <div key={concept.id} className="p-3 space-y-1.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="font-semibold text-zinc-950 dark:text-zinc-50 min-w-0 flex-1">
                      <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mr-1.5">
                        0{idx + 1}.
                      </span>
                      {isMy ? concept.titleMy : concept.titleEn}
                      <span className="ml-2 font-mono text-xs font-normal text-zinc-500 dark:text-zinc-400">
                        · {concept.formatLabel}
                      </span>
                    </div>
                    {onApplyConceptToBrief && (
                      <button
                        type="button"
                        onClick={() =>
                          onApplyConceptToBrief(
                            isMy
                              ? `Concept “${concept.titleMy}” (${concept.formatLabel}) ပုံစံအတိုင်း Script အပြည့်အစုံ ရေးပေးပါ — ${concept.angleSummaryMy}`
                              : `Write the full shooting script based on Concept "${concept.titleEn}" (${concept.formatLabel}): ${concept.angleSummaryEn}`
                          )
                        }
                        className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>
                          {isMy ? 'ဒီ Concept ဖြင့် Script ရေးမည်' : 'Use Concept in Brief'}
                        </span>
                        <ArrowRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    {isMy ? concept.angleSummaryMy : concept.angleSummaryEn}
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                    {isMy ? 'ရောင်းထွက်စေသည့်အကြောင်းရင်း: ' : 'Why it converts: '}
                    {isMy ? concept.whyItConvertsMy : concept.whyItConvertsEn}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
                <Sparkles className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
                <span>
                  {isMy
                    ? `3. ပထမ 3 စက္ကန့်အတွင်း ဆွဲဆောင်မည့် Hook ${blueprint.hooks.length} ခု (A/B Test တွဲသုံးနိုင်)`
                    : `3. ${blueprint.hooks.length} Modular 3-Second Hooks (Swap into Scene 1)`}
                </span>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {isMy
                  ? 'Hook တစ်ခုချင်းစီကို Script Scene 1 ထဲ လဲတပ်စမ်းနိုင် (0 cr)'
                  : 'Click any hook to swap live into Script Scene 1 (0 cr)'}
              </span>
            </div>

            <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 border border-zinc-200/70 dark:border-zinc-800/80 rounded-lg sp-surface-muted">
              {blueprint.hooks.map((hook, idx) => {
                const isActiveInScript = idx === safeHookIndex;
                return (
                  <div
                    key={hook.id}
                    className={`p-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 ${
                      isActiveInScript ? 'bg-white/80 dark:bg-zinc-800/50' : ''
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="font-mono tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                          Hook #{idx + 1}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{hook.hookType}</span>
                        {hook.onScreenText && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-zinc-600 dark:text-zinc-300">
                              「{hook.onScreenText}」
                            </span>
                          </>
                        )}
                      </div>
                      <p className="font-medium text-zinc-950 dark:text-zinc-50 leading-snug">
                        “{hook.hookText}”
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {isMy ? 'အဓိပ္ပာယ်: ' : 'Meaning / Note: '}
                        {hook.meaningMy}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          {isMy ? 'ရိုက်ကွက် (0–3s): ' : 'Visual (0–3s): '}
                        </span>
                        {isMy ? hook.visualActionMy : hook.visualActionEn}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedHookIndex(idx);
                          if (activeTab === 'concepts') {
                            setActiveTab('script');
                          }
                        }}
                        className={`inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          isActiveInScript
                            ? 'bg-emerald-700 text-white'
                            : 'text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
                        }`}
                      >
                        {isActiveInScript && <Check className="w-3 h-3 shrink-0" aria-hidden="true" />}
                        <span>
                          {isActiveInScript
                            ? isMy
                              ? 'Script တွင်သုံးနေ'
                              : 'Active in Script'
                            : isMy
                              ? 'Script ထဲသုံးမည်'
                              : 'Use in Script'}
                        </span>
                      </button>
                      {renderCopyBtn(`hook-${hook.id}`, hook.hookText)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. Scene-by-Scene Shooting Script (with Interactive Modular Hook A/B Switcher) */}
      {showSection('script') && (
        <div className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/80 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
              {isMy
                ? `4. Scene အလိုက် ရိုက်ကူးရန် Script — ${blueprint.scriptTitle}`
                : `4. Scene-by-Scene Shooting Script — ${blueprint.scriptTitle}`}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {blueprint.hooks.length > 1 &&
                renderCopyBtn(
                  'ab-test-pack',
                  abTestPackClipboardText,
                  'Copy 5-Hook A/B Pack',
                  '5 Hooks A/B Pack ကူးရန်'
                )}
              {allAiPromptsText &&
                renderCopyBtn(
                  'all-ai-prompts',
                  allAiPromptsText,
                  'Copy AI Prompts',
                  'AI Prompt အားလုံးကူးရန်'
                )}
              {renderCopyBtn(
                'full-script',
                fullScriptClipboardText,
                `Copy Script (Hook #${safeHookIndex + 1})`,
                `Script ကူးရန် (Hook #${safeHookIndex + 1})`
              )}
            </div>
          </div>

          {/* Modular Hook Switcher Bar (Swap Scene 1 live across Hook #1..#5 — 0 cr) */}
          {blueprint.hooks.length > 1 && (
            <div className="p-2.5 rounded-lg bg-zinc-100/80 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                    {isMy ? 'Scene 1 (0–3s) Hook ပြောင်းစမ်းရန်:' : 'Swap Scene 1 Opening Hook:'}
                  </span>
                  <div className="inline-flex flex-wrap items-center gap-1">
                    {blueprint.hooks.map((h, idx) => {
                      const active = idx === safeHookIndex;
                      return (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => setSelectedHookIndex(idx)}
                          title={h.hookType}
                          className={`min-h-[34px] px-2.5 py-1 text-xs font-mono tabular-nums font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                            active
                              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950'
                              : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
                          }`}
                        >
                          Hook #{idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {activeHook && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {activeHook.hookType}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {isMy
                  ? 'Body (Scene 2 မှ အဆုံးထိ) ကို 1 ခါတည်းရိုက်ထားပြီး Scene 1 ကို Hook #1–#5 လဲတပ်၍ Video 5 ပုဒ် A/B Test လုပ်နိုင်ပါသည် (API ထပ်မခေါ် · 0 cr)။'
                  : 'Film Scene 2–End ONCE as your shared Body + CTA, then swap Scene 1 with Hooks #1–#5 in CapCut for 5 A/B test ad variations (0 extra cr).'}
              </p>
            </div>
          )}

          <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 border border-zinc-200/70 dark:border-zinc-800/80 rounded-lg sp-surface-muted">
            {effectiveScenes.map((scene, idx) => (
              <div
                key={`${scene.sceneNumber}-${idx === 0 ? safeHookIndex : 'body'}`}
                className={`p-3 space-y-1.5 ${
                  idx === 0 ? 'bg-sky-50/40 dark:bg-sky-950/15' : ''
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                      {scene.timeRange}
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-semibold text-sky-700 dark:text-sky-400">
                      {scene.phaseLabel}
                    </span>
                    {idx === 0 && blueprint.hooks.length > 1 && (
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        {isMy ? '(ပြောင်းနိုင်)' : '(Swappable)'}
                      </span>
                    )}
                    {idx === 1 && blueprint.hooks.length > 1 && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {isMy ? '(ဘုံ Body စတင်)' : '(Shared Body starts)'}
                      </span>
                    )}
                  </div>
                  {scene.onScreenText && (
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      {isMy ? 'စာတန်း: ' : 'Overlay: '}「{scene.onScreenText}」
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-zinc-950 dark:text-zinc-50 font-medium leading-relaxed">
                    {scene.voiceover}
                  </p>
                  {scene.voiceoverMy && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {scene.voiceoverMy}
                    </p>
                  )}
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {isMy ? 'ကင်မရာ / ရိုက်ကွက်: ' : 'Camera / Shot: '}
                  </span>
                  {isMy ? scene.shotDirectionMy : scene.shotDirectionEn}
                </p>

                {scene.aiVideoPromptEn && (
                  <div className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800/70 flex items-start justify-between gap-2">
                    <p className="font-mono text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed min-w-0 flex-1">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                        AI Prompt:{' '}
                      </span>
                      {scene.aiVideoPromptEn}
                    </p>
                    {renderCopyBtn(
                      `ai-prompt-${scene.sceneNumber}-${idx === 0 ? safeHookIndex : 'b'}`,
                      scene.aiVideoPromptEn,
                      'Copy',
                      'ကူးရန်'
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. TikTok SEO Publishing Pack (Titles · Keywords · Hashtags · Caption) */}
      {showSection('seo') && (
        <div className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/80 space-y-3">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
            <Hash className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
            <span>
              {isMy
                ? '5. TikTok SEO Pack (Title၊ Keywords နှင့် Hashtags)'
                : '5. TikTok SEO Publishing Pack (Titles, Keywords & Hashtags)'}
            </span>
          </div>

          {/* 3 Title Styles */}
          <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 border border-zinc-200/70 dark:border-zinc-800/80 rounded-lg sp-surface-muted">
            {blueprint.seoPack.titles.map((titleObj, idx) => (
              <div key={`${titleObj.style}-${idx}`} className="p-2.5 flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {isMy ? titleObj.labelMy : titleObj.labelEn}
                  </div>
                  <p className="font-medium text-zinc-950 dark:text-zinc-50 leading-snug">
                    {titleObj.titleText}
                  </p>
                  {titleObj.meaningMy && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {titleObj.meaningMy}
                    </p>
                  )}
                </div>
                {renderCopyBtn(`title-${idx}`, titleObj.titleText)}
              </div>
            ))}
          </div>

          {/* Search Keywords + Hashtag Groups */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 border border-zinc-200/70 dark:border-zinc-800/80 rounded-lg sp-surface-muted space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  TikTok Search Keywords
                </span>
                {allKeywordsText && renderCopyBtn('seo-keywords', allKeywordsText)}
              </div>
              <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
                {blueprint.seoPack.searchKeywords.join(' · ')}
              </p>
            </div>

            <div className="p-3 border border-zinc-200/70 dark:border-zinc-800/80 rounded-lg sp-surface-muted space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {isMy ? 'Hashtag အစုအဝေး (Spam-Safe)' : 'Curated Hashtags (Spam-Safe)'}
                </span>
                {allHashtagsText && renderCopyBtn('seo-hashtags', allHashtagsText)}
              </div>
              <div className="space-y-1 text-xs leading-relaxed">
                {blueprint.seoPack.hashtagsBroad.length > 0 && (
                  <div>
                    <span className="text-zinc-500 dark:text-zinc-400">Broad: </span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">
                      {blueprint.seoPack.hashtagsBroad.join(' ')}
                    </span>
                  </div>
                )}
                {blueprint.seoPack.hashtagsNiche.length > 0 && (
                  <div>
                    <span className="text-zinc-500 dark:text-zinc-400">Niche: </span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">
                      {blueprint.seoPack.hashtagsNiche.join(' ')}
                    </span>
                  </div>
                )}
                {blueprint.seoPack.hashtagsBuyerIntent.length > 0 && (
                  <div>
                    <span className="text-zinc-500 dark:text-zinc-400">Buyer Intent: </span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">
                      {blueprint.seoPack.hashtagsBuyerIntent.join(' ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ready-to-Paste Caption Template */}
          {blueprint.seoPack.captionTemplate && (
            <div className="p-3 border border-zinc-200/70 dark:border-zinc-800/80 rounded-lg sp-surface-muted space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {isMy ? 'ချက်ချင်းတင်နိုင်သော Caption Template' : 'Ready-to-Paste Caption Template'}
                </span>
                {renderCopyBtn(
                  'seo-caption',
                  blueprint.seoPack.captionTemplate,
                  'Copy Caption',
                  'Caption ကူးရန်'
                )}
              </div>
              <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
                {blueprint.seoPack.captionTemplate}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 6. TikTok Shop Ad Policy / Compliance Guard */}
      {showSection('policy') && blueprint.policyGuards.length > 0 && (
        <div className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/80 space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              {isMy
                ? '6. TikTok Shop မူဝါဒသတိပေးချက် (Policy Guard)'
                : '6. TikTok Shop Ad Policy & Compliance Guard'}
            </span>
          </div>

          <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 border border-zinc-200/70 dark:border-zinc-800/80 rounded-lg sp-surface-muted">
            {blueprint.policyGuards.map((guard, idx) => (
              <div key={idx} className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                    {isMy ? 'ရှောင်ကြဉ်ရမည့် အသုံးအနှုန်း' : 'Avoid Risky Claim'}
                  </div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    “{guard.riskyClaim}”
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {isMy ? guard.reasonMy : guard.reasonEn}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {isMy ? 'ဘေးကင်းစွာ ပြောင်းလဲသုံးရန်' : 'Safe Compliant Alternative'}
                  </div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100 leading-relaxed">
                    “{guard.safeAlternative}”
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
