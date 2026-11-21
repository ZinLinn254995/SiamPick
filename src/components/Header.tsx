import { Bookmark, Coins, Globe, History, Loader2, Moon, Sun } from 'lucide-react';
import { AppView, CategoryFilter, Language } from '../types/product';
import { TRANSLATIONS } from '../i18n/translations';
import type { KalodataBalanceState } from '../hooks/useKalodataBalance';
import type { ThemeMode } from '../hooks/useTheme';

interface HeaderProps {
  activeView: AppView;
  activeCategory: CategoryFilter;
  onGoHome: () => void;
  onSelectCategory: (category: CategoryFilter) => void;
  onFocusStrategy: () => void;
  historyCount: number;
  onToggleHistoryView: () => void;
  shortlistCount: number;
  onToggleSavedView: () => void;
  language: Language;
  onChangeLanguage: (language: Language) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  creditBalance: KalodataBalanceState;
}

function formatCompactHeaderBalance(balance: number): string {
  if (Number.isInteger(balance)) {
    return balance.toLocaleString();
  }
  return balance.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function Header({
  activeView,
  activeCategory,
  onGoHome,
  onSelectCategory,
  onFocusStrategy,
  historyCount,
  onToggleHistoryView,
  shortlistCount,
  onToggleSavedView,
  language,
  onChangeLanguage,
  theme,
  onToggleTheme,
  creditBalance,
}: HeaderProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const isDark = theme === 'dark';

  const { status: balanceStatus, loading: balanceLoading, refreshBalance } = creditBalance;
  const hasNumericBalance = Boolean(balanceStatus?.ok && balanceStatus.balance !== null);
  const rawBalanceNumber = hasNumericBalance
    ? formatCompactHeaderBalance(balanceStatus!.balance!)
    : '--';
  const unitFull = balanceStatus?.unit ? balanceStatus.unit : 'credits';
  const unitShort = /^credits?$/i.test(unitFull) ? 'cr' : unitFull;

  const balanceTitle = isMy
    ? hasNumericBalance
      ? `လက်ကျန် Credit Balance: ${rawBalanceNumber} ${unitFull} — ပြန်စစ်ရန် နှိပ်ပါ`
      : 'Kalodata Credit Balance စစ်ဆေးရန် နှိပ်ပါ'
    : hasNumericBalance
      ? `Kalodata Credit Balance: ${rawBalanceNumber} ${unitFull} — Click to refresh`
      : 'Click to check Kalodata Credit Balance';

  const themeToggleLabel = isMy
    ? isDark
      ? 'Light Mode ပြောင်းရန်'
      : 'Dark Mode ပြောင်းရန်'
    : isDark
      ? 'Switch to Light Mode'
      : 'Switch to Dark Mode';

  const languageToggleLabel = isMy ? 'Switch to English' : 'မြန်မာဘာသာသို့ ပြောင်းရန်';

  return (
    <header className="sticky top-0 z-30 bg-[#FAFAFA]/95 dark:bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-200/80 dark:border-zinc-800/80 overflow-x-clip transition-colors">
      <div className="max-w-[1280px] mx-auto px-3.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-5">
        {/* Zone 1: Brand Wordmark + Quiet Unboxed Credit Balance */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 shrink-0">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              onGoHome();
            }}
            className="font-display text-base sm:text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 rounded-sm"
          >
            SiamPick
          </a>

          <span
            className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 shrink-0"
            aria-hidden="true"
          />

          {/* Unboxed, lightweight Credit Balance readout (click to refresh) */}
          <button
            type="button"
            onClick={() => void refreshBalance()}
            disabled={balanceLoading}
            title={balanceTitle}
            aria-label={balanceTitle}
            className="inline-flex items-center gap-1.5 px-1.5 py-1 -mx-1 rounded-md text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-950 dark:hover:text-zinc-100 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
          >
            {balanceLoading ? (
              <Loader2
                className="w-3.5 h-3.5 text-zinc-400 animate-spin shrink-0"
                aria-hidden="true"
              />
            ) : (
              <Coins
                className={`w-3.5 h-3.5 shrink-0 ${
                  hasNumericBalance
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
                aria-hidden="true"
              />
            )}
            <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {balanceLoading ? '...' : rawBalanceNumber}
            </span>
            {!balanceLoading && hasNumericBalance && (
              <>
                <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 xl:hidden">
                  {unitShort}
                </span>
                <span className="hidden xl:inline font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                  {unitFull}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Zone 2: Clean Unboxed Text Navigation (Visible from Tablet md+ upwards) */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-5 lg:gap-7 text-[13px] lg:text-sm font-medium text-zinc-600 dark:text-zinc-400 min-w-0"
        >
          <button
            type="button"
            onClick={() => onSelectCategory('all')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
              activeView === 'hunting' && activeCategory === 'all'
                ? 'text-zinc-950 dark:text-zinc-50 border-zinc-950 dark:border-zinc-100'
                : 'border-transparent hover:text-zinc-950 dark:hover:text-zinc-50 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            {t.navDiscover}
          </button>
          <button
            type="button"
            onClick={onFocusStrategy}
            className="hidden lg:inline-flex py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 border-transparent hover:text-zinc-950 dark:hover:text-zinc-50 hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            {t.navCategories} &amp; {t.navStrategy}
          </button>
          <button
            type="button"
            onClick={onToggleHistoryView}
            aria-current={activeView === 'history' ? 'page' : undefined}
            className={`py-1 inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
              activeView === 'history'
                ? 'text-zinc-950 dark:text-zinc-50 border-zinc-950 dark:border-zinc-100'
                : 'border-transparent hover:text-zinc-950 dark:hover:text-zinc-50 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            <span>{t.navHistory}</span>
            <span className="font-mono text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
              ({historyCount})
            </span>
          </button>
        </nav>

        {/* Zone 3: Quiet Ghost Utility Controls + Single Primary Saved Action */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Compact Single-Button Language Toggle (Ghost style — no heavy box) */}
          <button
            type="button"
            onClick={() => onChangeLanguage(isMy ? 'en' : 'my')}
            title={languageToggleLabel}
            aria-label={languageToggleLabel}
            className="inline-flex items-center gap-1 min-h-[34px] sm:min-h-[36px] px-2 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
          >
            <Globe className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" aria-hidden="true" />
            <span>{isMy ? 'မြန်မာ' : 'EN'}</span>
          </button>

          {/* Quiet Ghost Light/Dark Mode Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-pressed={isDark}
            aria-label={themeToggleLabel}
            title={themeToggleLabel}
            className="inline-flex items-center justify-center w-[34px] h-[34px] sm:w-[36px] sm:h-[36px] rounded-lg text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          {/* Mobile-Only Ghost History Button (Tablet md+ has History in center nav) */}
          <button
            type="button"
            onClick={onToggleHistoryView}
            aria-pressed={activeView === 'history'}
            aria-label={`${t.navHistory} (${historyCount})`}
            title={`${t.navHistory} (${historyCount})`}
            className={`md:hidden inline-flex items-center gap-1 min-h-[34px] px-2 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'history'
                ? 'bg-zinc-200/80 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50'
                : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
            }`}
          >
            <History className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="font-mono tabular-nums text-[11px]">{historyCount}</span>
          </button>

          {/* Subtle separator before primary CTA on sm+ */}
          <span
            className="hidden sm:block h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5 shrink-0"
            aria-hidden="true"
          />

          {/* Single Primary CTA: Saved Products */}
          <button
            type="button"
            onClick={onToggleSavedView}
            aria-pressed={activeView === 'saved'}
            aria-label={`${t.shortlistBtn} (${shortlistCount})`}
            className={`inline-flex items-center gap-1.5 min-h-[34px] sm:min-h-[36px] px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-[13px] font-medium rounded-lg active:scale-[0.99] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-200 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 ${
              activeView === 'saved'
                ? 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
                : 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white'
            }`}
          >
            <Bookmark
              className={`w-3.5 h-3.5 shrink-0 ${activeView === 'saved' ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">{t.shortlistBtn}</span>
            <span className="font-mono tabular-nums opacity-80">({shortlistCount})</span>
          </button>
        </div>
      </div>
    </header>
  );
}
