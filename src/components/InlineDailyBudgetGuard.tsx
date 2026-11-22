import { useEffect, useState } from 'react';
import { AlertTriangle, SlidersHorizontal } from 'lucide-react';
import type { Language } from '../types/product';
import {
  formatCredits,
  MAX_SPENDING_LIMIT_CREDITS,
  MIN_SPENDING_LIMIT_CREDITS,
} from '../utils/kalodataPricing';
import { InfoPopover } from './InfoPopover';

const DAILY_LIMIT_PRESETS = [0.5, 1.5, 3, 5, 10] as const;

interface InlineDailyBudgetGuardProps {
  language: Language;
  dailyLimitCredits: number;
  usedCreditsToday?: number | null;
  remainingCreditsToday?: number | null;
  requiredCredits?: number;
  budgetStorageAvailable?: boolean;
  onUpdateDailyLimit?: (nextLimit: number) => void;
  testId?: string;
}

export function InlineDailyBudgetGuard({
  language,
  dailyLimitCredits,
  usedCreditsToday,
  remainingCreditsToday,
  requiredCredits = 0,
  budgetStorageAvailable = true,
  onUpdateDailyLimit,
  testId,
}: InlineDailyBudgetGuardProps) {
  const isMy = language === 'my';
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => formatCredits(dailyLimitCredits));

  useEffect(() => {
    setDraft(formatCredits(dailyLimitCredits));
  }, [dailyLimitCredits]);

  const safeUsed =
    typeof usedCreditsToday === 'number' && Number.isFinite(usedCreditsToday)
      ? Math.max(0, Math.round(usedCreditsToday * 1000) / 1000)
      : 0;

  const safeRemaining =
    typeof remainingCreditsToday === 'number' && Number.isFinite(remainingCreditsToday)
      ? Math.max(0, Math.round(remainingCreditsToday * 1000) / 1000)
      : Math.max(0, Math.round((dailyLimitCredits - safeUsed) * 1000) / 1000);

  const hasRequired = typeof requiredCredits === 'number' && requiredCredits > 0;
  const exceedsRemaining = hasRequired && requiredCredits > safeRemaining + 1e-6;
  const exceedsConfigured = hasRequired && requiredCredits > dailyLimitCredits + 1e-6;
  const isBlocked = exceedsRemaining || exceedsConfigured;

  const recommendedLimit = Math.min(
    MAX_SPENDING_LIMIT_CREDITS,
    Math.max(
      MIN_SPENDING_LIMIT_CREDITS,
      Math.ceil((safeUsed + Math.max(0, requiredCredits)) * 10) / 10
    )
  );

  const commitValue = (rawVal: string) => {
    const parsed = Number.parseFloat(rawVal);
    if (!Number.isFinite(parsed) || parsed < MIN_SPENDING_LIMIT_CREDITS) {
      setDraft(formatCredits(dailyLimitCredits));
      return;
    }
    const clamped =
      Math.round(
        Math.max(MIN_SPENDING_LIMIT_CREDITS, Math.min(MAX_SPENDING_LIMIT_CREDITS, parsed)) * 1000
      ) / 1000;
    setDraft(formatCredits(clamped));
    onUpdateDailyLimit?.(clamped);
  };

  const showEditor = isEditing || (isBlocked && Boolean(onUpdateDailyLimit));

  return (
    <div
      data-testid={testId}
      className={`rounded-lg border px-3 py-2.5 text-xs space-y-2 transition-colors ${
        !budgetStorageAvailable || isBlocked
          ? 'bg-red-50/70 dark:bg-red-950/25 border-red-200 dark:border-red-800/70'
          : 'bg-white dark:bg-zinc-900 border-zinc-200/90 dark:border-zinc-800'
      }`}
    >
      {/* Top Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <span className="inline-flex items-center gap-1 font-semibold text-zinc-900 dark:text-zinc-100">
            <span>{isMy ? 'တစ်နေ့တာ Credit ကန့်သတ်ချက်' : 'Daily Credit Guardrail'}</span>
            <InfoPopover
              variant="info"
              label={isMy ? 'တစ်နေ့တာ Credit ကန့်သတ်ချက် ရှင်းလင်းချက်' : 'Daily Credit Guardrail info'}
              title={isMy ? 'တစ်နေ့တာ Credit ကန့်သတ်ချက်' : 'Daily Credit Guardrail (UTC Day)'}
              content={
                isMy
                  ? 'Product Details ဖြည့်စွက်မှု၊ Link Research၊ Same-Product နှင့် Deep Dive တို့အားလုံး တစ်နေ့တာ (UTC) စုစုပေါင်း Credit Limit ကို မျှဝေသုံးစွဲပါသည်။ Batch Research ၏ တစ်ကြိမ်စာ Limit နှင့် သီးခြားခွဲထားပါသည်။'
                  : 'Shared UTC-daily budget ceiling across Details Enrichment, Single Link Research, Same-Product Hunter, and Deep Dive. Separate from your Batch Per-Search Limit.'
              }
            />
          </span>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
            <span>
              {isMy ? 'သုံးပြီး' : 'Used'}:{' '}
              <strong className="text-zinc-900 dark:text-zinc-100">{formatCredits(safeUsed)}</strong>
            </span>
            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
              ·
            </span>
            <span>
              {isMy ? 'ကျန်' : 'Left'}:{' '}
              <strong
                className={
                  safeRemaining <= 0 || isBlocked
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }
              >
                {formatCredits(safeRemaining)} cr
              </strong>
            </span>
            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
              ·
            </span>
            <span>
              {isMy ? 'Limit' : 'Cap'}:{' '}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {formatCredits(dailyLimitCredits)} cr
              </strong>
            </span>
          </div>
        </div>

        {onUpdateDailyLimit && (
          <button
            type="button"
            onClick={() => setIsEditing((prev) => !prev)}
            aria-expanded={showEditor}
            className="inline-flex items-center gap-1 min-h-[32px] px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>
              {isEditing
                ? isMy
                  ? 'ပိတ်မည်'
                  : 'Close'
                : isMy
                  ? 'Daily Limit ပြင်ရန်'
                  : 'Adjust Limit'}
            </span>
          </button>
        )}
      </div>

      {/* Fail-Closed Storage Unavailable Alert */}
      {!budgetStorageAvailable && (
        <div role="alert" className="flex items-start gap-2 text-red-800 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" aria-hidden="true" />
          <p className="leading-relaxed">
            {isMy
              ? 'Server Budget Storage မရရှိနိုင်သေးသဖြင့် Paid Kalodata API ခေါ်ဆိုမှုကို လုံခြုံရေးအရ ပိတ်ထားပါသည်။'
              : 'Persistent budget storage is unavailable. Paid Kalodata API calls are safely blocked.'}
          </p>
        </div>
      )}

      {/* Clear Block Reason + 1-Click Raise CTA */}
      {budgetStorageAvailable && isBlocked && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-red-900 dark:text-red-200"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" aria-hidden="true" />
            <p className="leading-relaxed">
              {safeUsed > 0
                ? isMy
                  ? `ယနေ့ စုစုပေါင်း ${formatCredits(safeUsed)} / ${formatCredits(dailyLimitCredits)} cr သုံးစွဲထားပြီး ဖြစ်၍ ${formatCredits(safeRemaining)} cr သာ ကျန်ပါသည်။ ယခုလုပ်ဆောင်မှု (${formatCredits(requiredCredits)} cr) အတွက် Daily Limit ကို တိုးမြှင့်ပေးပါ။`
                  : `Today's shared usage is ${formatCredits(safeUsed)} / ${formatCredits(dailyLimitCredits)} cr (${formatCredits(safeRemaining)} cr left). Needs ${formatCredits(requiredCredits)} cr — raise Daily Limit or deselect layers.`
                : isMy
                  ? `ခန့်မှန်းကုန်ကျစရိတ် (${formatCredits(requiredCredits)} cr) သည် လက်ရှိ Daily Limit (${formatCredits(dailyLimitCredits)} cr) ထက် ကျော်လွန်နေပါသည်။`
                  : `Estimated cost (${formatCredits(requiredCredits)} cr) exceeds your Daily Limit (${formatCredits(dailyLimitCredits)} cr). Raise Daily Limit or deselect higher-cost layers.`}
            </p>
          </div>

          {onUpdateDailyLimit && recommendedLimit > dailyLimitCredits && (
            <button
              type="button"
              onClick={() => onUpdateDailyLimit(recommendedLimit)}
              className="inline-flex items-center justify-center min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 dark:bg-red-700 dark:hover:bg-red-600 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {isMy
                ? `Limit ကို ${formatCredits(recommendedLimit)} cr သို့ တိုးမည်`
                : `Raise to ${formatCredits(recommendedLimit)} cr`}
            </button>
          )}
        </div>
      )}

      {/* Inline Editor Controls */}
      {showEditor && onUpdateDailyLimit && (
        <div className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800/80 flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center gap-1 min-h-[36px] px-2 py-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md">
            <input
              type="number"
              inputMode="decimal"
              aria-label={isMy ? 'တစ်နေ့တာ Credit Limit' : 'Daily Credit Limit'}
              min={MIN_SPENDING_LIMIT_CREDITS}
              max={MAX_SPENDING_LIMIT_CREDITS}
              step={0.1}
              value={draft}
              onChange={(e) => {
                const next = e.target.value;
                setDraft(next);
                const parsed = Number.parseFloat(next);
                if (
                  Number.isFinite(parsed) &&
                  parsed >= MIN_SPENDING_LIMIT_CREDITS &&
                  parsed <= MAX_SPENDING_LIMIT_CREDITS
                ) {
                  onUpdateDailyLimit(Math.round(parsed * 1000) / 1000);
                }
              }}
              onBlur={() => commitValue(draft)}
              className="w-16 text-right font-mono text-xs font-semibold tabular-nums text-zinc-950 dark:text-zinc-50 bg-transparent focus:outline-none"
            />
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">cr</span>
          </div>

          {DAILY_LIMIT_PRESETS.map((preset) => {
            const active = Math.abs(dailyLimitCredits - preset) < 1e-6;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => onUpdateDailyLimit(preset)}
                className={`min-h-[36px] px-2.5 py-1 text-xs font-mono tabular-nums rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-900 dark:border-zinc-100 font-semibold'
                    : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
                }`}
              >
                {formatCredits(preset)} cr
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
