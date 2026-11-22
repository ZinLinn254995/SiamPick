import { Bookmark, Coins, Globe, HardDrive, Moon, Sun } from 'lucide-react';
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
  onOpenBackupModal?: () => void;
  language: Language;
  onChangeLanguage: (language: Language) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  creditBalance: KalodataBalanceState;
}

function formatCompactHeaderBalance(balance: number): string {
  if (Number.isInteger(balance)) {
    return balance.toLocaleString('en-US');
  }
  return balance.toLocaleString('en-US', { maximumFractionDigits: 2 });
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
  onOpenBackupModal,
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
    : '—';
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
    <header className="sticky top-0 z-30 bg-[#FAFAFA]/95 dark:bg-zinc-950/95 backdrop-blur-md border-b border-zinc-200/85 dark:border-zinc-800/85 overflow-x-clip transition-colors">
      <div className="max-w-[1280px] mx-auto px-3.5 sm:px-6 lg:px-8 h-[52px] sm:h-[60px] flex items-center justify-between gap-2 sm:gap-5">
        {/* Zone 1: Brand Wordmark + Quiet Unboxed Credit Balance */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              onGoHome();
            }}
            className="inline-flex items-center min-h-[40px] font-display text-base sm:text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 rounded-sm"
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
            aria-label={balanceLoading ? t.creditsLoadingLabel : balanceTitle}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-2 py-1.5 -mx-1 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-950 dark:hover:text-zinc-100 disabled:opacity-75 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
          >
            {balanceLoading ? (
              <span className="inline-flex items-center gap-1.5" aria-busy="true">
                <span
                  aria-hidden="true"
                  className="w-3.5 h-3.5 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse motion-reduce:animate-none shrink-0"
                />
                <span
                  aria-hidden="true"
                  className="h-3.5 w-11 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse motion-reduce:animate-none"
                />
                <span className="sr-only">{t.creditsLoadingLabel}</span>
              </span>
            ) : (
              <>
                <Coins
                  className={`w-3.5 h-3.5 shrink-0 ${
                    hasNumericBalance
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                  aria-hidden="true"
                />
                <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {rawBalanceNumber}
                </span>
                {hasNumericBalance && (
                  <>
                    <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 xl:hidden">
                      {unitShort}
                    </span>
                    <span className="hidden xl:inline font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {unitFull}
                    </span>
                  </>
                )}
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
            className={`inline-flex items-center min-h-[40px] py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
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
            className="hidden lg:inline-flex items-center min-h-[40px] py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 border-transparent hover:text-zinc-950 dark:hover:text-zinc-50 hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            {t.navCategories} &amp; {t.navStrategy}
          </button>
          <button
            type="button"
            onClick={onToggleHistoryView}
            aria-current={activeView === 'history' ? 'page' : undefined}
            className={`inline-flex items-center gap-1 min-h-[40px] py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
              activeView === 'history'
                ? 'text-zinc-950 dark:text-zinc-50 border-zinc-950 dark:border-zinc-100'
                : 'border-transparent hover:text-zinc-950 dark:hover:text-zinc-50 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            <span>{t.navHistory}</span>
            <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              ({historyCount})
            </span>
          </button>
        </nav>

        {/* Zone 3: Quiet Ghost Utility Controls + Desktop Primary Saved Action (Mobile uses bottom tab bar) */}
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          {/* Compact Single-Button Language Toggle (Ghost style — no heavy box) */}
          <button
            type="button"
            onClick={() => onChangeLanguage(isMy ? 'en' : 'my')}
            title={languageToggleLabel}
            aria-label={languageToggleLabel}
            className="inline-flex items-center justify-center gap-1 min-h-[40px] min-w-[40px] px-2 sm:px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
          >
            <Globe className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
            <span>{isMy ? 'မြန်မာ' : 'EN'}</span>
          </button>

          {/* Quiet Ghost Light/Dark Mode Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-pressed={isDark}
            aria-label={themeToggleLabel}
            title={themeToggleLabel}
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          {/* Quiet Ghost Backup & Restore Trigger */}
          {onOpenBackupModal && (
            <button
              type="button"
              onClick={onOpenBackupModal}
              title={isMy ? 'Backup နှင့် Restore' : 'Backup & Restore'}
              aria-label={isMy ? 'Backup နှင့် Restore' : 'Backup & Restore'}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] min-w-[40px] px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
            >
              <HardDrive className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
              <span className="hidden xl:inline">Backup</span>
            </button>
          )}

          {/* Subtle separator before primary CTA on md+ */}
          <span
            className="hidden md:block h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5 shrink-0"
            aria-hidden="true"
          />

          {/* Single Primary CTA: Saved Products (Tablet md+ — mobile uses bottom tab bar) */}
          <button
            type="button"
            onClick={onToggleSavedView}
            aria-pressed={activeView === 'saved'}
            aria-label={`${t.shortlistBtn} (${shortlistCount})`}
            className={`hidden md:inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 text-[13px] font-medium rounded-lg active:scale-[0.99] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-200 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 ${
              activeView === 'saved'
                ? 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-700 dark:hover:bg-emerald-600'
                : 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white'
            }`}
          >
            <Bookmark
              className={`w-3.5 h-3.5 shrink-0 ${activeView === 'saved' ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
            <span>{t.shortlistBtn}</span>
            <span className="font-mono tabular-nums opacity-85">({shortlistCount})</span>
          </button>
        </div>
      </div>
    </header>
  );
}
