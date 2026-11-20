import { Bookmark } from 'lucide-react';
import { AppView, CategoryFilter, Language } from '../types/product';
import { TRANSLATIONS } from '../i18n/translations';

interface HeaderProps {
  activeView: AppView;
  activeCategory: CategoryFilter;
  onGoHome: () => void;
  onSelectCategory: (category: CategoryFilter) => void;
  onFocusStrategy: () => void;
  shortlistCount: number;
  onToggleSavedView: () => void;
  language: Language;
}

export function Header({
  activeView,
  activeCategory,
  onGoHome,
  onSelectCategory,
  onFocusStrategy,
  shortlistCount,
  onToggleSavedView,
  language,
}: HeaderProps) {
  const t = TRANSLATIONS[language];

  return (
    <header className="sticky top-0 z-30 bg-[#FAFAFA]/95 backdrop-blur-sm border-b border-zinc-200/80">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onGoHome();
          }}
          className="font-display text-lg font-bold tracking-tight text-zinc-950 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 rounded-sm"
        >
          SiamPick
        </a>

        {/* Zone 2: 4 Concise Single-Line Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600"
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
            onClick={() => onSelectCategory('womens-fashion')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
              activeView === 'hunting' && activeCategory === 'womens-fashion'
                ? 'text-zinc-950 border-zinc-950'
                : 'border-transparent hover:text-zinc-950 hover:border-zinc-300'
            }`}
          >
            {t.navFashion}
          </button>
          <button
            type="button"
            onClick={() => onSelectCategory('cosmetics-beauty')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
              activeView === 'hunting' && activeCategory === 'cosmetics-beauty'
                ? 'text-zinc-950 border-zinc-950'
                : 'border-transparent hover:text-zinc-950 hover:border-zinc-300'
            }`}
          >
            {t.navBeauty}
          </button>
          <button
            type="button"
            onClick={onFocusStrategy}
            className="py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 border-transparent hover:text-zinc-950 hover:border-zinc-300"
          >
            {t.navStrategy}
          </button>
        </nav>

        {/* Zone 3: Single Primary Action (Saved Products View Toggle) */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onToggleSavedView}
            aria-pressed={activeView === 'saved'}
            className={`inline-flex items-center gap-2 min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium rounded-lg active:scale-[0.99] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 ${
              activeView === 'saved'
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'bg-zinc-950 text-white hover:bg-zinc-800'
            }`}
          >
            <Bookmark
              className={`w-3.5 h-3.5 ${activeView === 'saved' ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
            <span>{t.shortlistBtn}</span>
            <span className="font-mono tabular-nums opacity-80">({shortlistCount})</span>
          </button>
        </div>
      </div>
    </header>
  );
}
