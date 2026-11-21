import { Bookmark, History } from 'lucide-react';
import { AppView, CategoryFilter, Language } from '../types/product';
import { TRANSLATIONS } from '../i18n/translations';

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
}: HeaderProps) {
  const t = TRANSLATIONS[language];

  return (
    <header className="sticky top-0 z-30 bg-[#FAFAFA]/95 backdrop-blur-sm border-b border-zinc-200/80 overflow-x-clip">
      <div className="max-w-[1280px] mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4 lg:gap-5">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onGoHome();
          }}
          className="font-display text-base sm:text-lg font-bold tracking-tight text-zinc-950 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 rounded-sm"
        >
          SiamPick
        </a>

        {/* Zone 2: Concise Single-Line Navigation Links (Desktop lg+ only so tablet never overflows) */}
        <nav
          aria-label="Primary navigation"
          className="hidden lg:flex items-center gap-5 xl:gap-7 text-[13px] xl:text-sm font-medium text-zinc-600 min-w-0"
        >
          <button
            type="button"
            onClick={() => onSelectCategory('all')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
              activeView === 'hunting' && activeCategory === 'all'
                ? 'text-zinc-950 border-zinc-950'
                : 'border-transparent hover:text-zinc-950 hover:border-zinc-300'
            }`}
          >
            {t.navDiscover}
          </button>
          <button
            type="button"
            onClick={onFocusStrategy}
            className="py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 border-transparent hover:text-zinc-950 hover:border-zinc-300"
          >
            {t.navCategories} &amp; {t.navStrategy}
          </button>
          <button
            type="button"
            onClick={onToggleHistoryView}
            aria-current={activeView === 'history' ? 'page' : undefined}
            className={`py-1 inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
              activeView === 'history'
                ? 'text-zinc-950 border-zinc-950'
                : 'border-transparent hover:text-zinc-950 hover:border-zinc-300'
            }`}
          >
            <span>{t.navHistory}</span>
            <span className="font-mono text-xs tabular-nums text-zinc-400">({historyCount})</span>
          </button>
        </nav>

        {/* Zone 3: Language Switcher + Tablet/Mobile History Toggle + Primary Saved Action */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Language Switcher (EN / မြန်မာ) */}
          <div
            className="inline-flex items-center p-0.5 bg-zinc-200/75 rounded-lg shrink-0"
            role="group"
            aria-label="Language"
          >
            <button
              type="button"
              onClick={() => onChangeLanguage('en')}
              aria-pressed={language === 'en'}
              className={`min-h-[30px] sm:min-h-[32px] px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                language === 'en'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => onChangeLanguage('my')}
              aria-pressed={language === 'my'}
              className={`min-h-[30px] sm:min-h-[32px] px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                language === 'my'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              မြန်မာ
            </button>
          </div>

          {/* Mobile & Tablet History Button (Desktop lg+ has History in center nav) */}
          <button
            type="button"
            onClick={onToggleHistoryView}
            aria-pressed={activeView === 'history'}
            aria-label={`${t.navHistory} (${historyCount})`}
            className={`lg:hidden inline-flex items-center gap-1 sm:gap-1.5 min-h-[36px] sm:min-h-[38px] px-2 sm:px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'history'
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400 hover:text-zinc-950'
            }`}
          >
            <History className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">{t.navHistory}</span>
            <span className="font-mono tabular-nums opacity-75">({historyCount})</span>
          </button>

          {/* Primary Saved Products Button */}
          <button
            type="button"
            onClick={onToggleSavedView}
            aria-pressed={activeView === 'saved'}
            aria-label={`${t.shortlistBtn} (${shortlistCount})`}
            className={`inline-flex items-center gap-1.5 min-h-[36px] sm:min-h-[38px] px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-[13px] font-medium rounded-lg active:scale-[0.99] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 ${
              activeView === 'saved'
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'bg-zinc-950 text-white hover:bg-zinc-800'
            }`}
          >
            <Bookmark
              className={`w-3.5 h-3.5 shrink-0 ${activeView === 'saved' ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
            <span className="hidden min-[420px]:inline">{t.shortlistBtn}</span>
            <span className="font-mono tabular-nums opacity-80">({shortlistCount})</span>
          </button>
        </div>
      </div>
    </header>
  );
}


