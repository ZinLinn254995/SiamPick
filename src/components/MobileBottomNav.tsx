import { Bookmark, Compass, History } from 'lucide-react';
import type { AppView, Language } from '../types/product';
import { TRANSLATIONS } from '../i18n/translations';

export interface MobileBottomNavProps {
  activeView: AppView;
  shortlistCount: number;
  historyCount: number;
  onSelectDiscover: () => void;
  onSelectHistory: () => void;
  onSelectSaved: () => void;
  language: Language;
}

export function MobileBottomNav({
  activeView,
  shortlistCount,
  historyCount,
  onSelectDiscover,
  onSelectHistory,
  onSelectSaved,
  language,
}: MobileBottomNavProps) {
  const t = TRANSLATIONS[language];
  const isDiscoverActive = activeView === 'hunting' || activeView === 'deep-dive';
  const isHistoryActive = activeView === 'history';
  const isSavedActive = activeView === 'saved';

  return (
    <nav
      aria-label={t.mobileNavLabel}
      className="fixed inset-x-0 bottom-0 z-40 md:hidden bg-white/96 dark:bg-zinc-950/96 backdrop-blur-md border-t border-zinc-200/90 dark:border-zinc-800/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_-8px_rgba(9,9,11,0.1)] dark:shadow-[0_-4px_18px_-8px_rgba(0,0,0,0.45)]"
    >
      <div className="grid grid-cols-3 max-w-lg mx-auto px-1">
        <button
          type="button"
          onClick={onSelectDiscover}
          aria-current={isDiscoverActive ? 'page' : undefined}
          className={`relative flex flex-col items-center justify-center gap-1 min-h-[54px] py-1.5 px-1 text-xs font-medium transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
            isDiscoverActive
              ? 'text-zinc-950 dark:text-zinc-50 font-semibold'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
          }`}
        >
          {isDiscoverActive && (
            <span
              aria-hidden="true"
              className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-zinc-950 dark:bg-zinc-100"
            />
          )}
          <Compass className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
          <span className="truncate max-w-full leading-tight">{t.navDiscover}</span>
        </button>

        <button
          type="button"
          onClick={onSelectHistory}
          aria-current={isHistoryActive ? 'page' : undefined}
          className={`relative flex flex-col items-center justify-center gap-1 min-h-[54px] py-1.5 px-1 text-xs font-medium transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
            isHistoryActive
              ? 'text-zinc-950 dark:text-zinc-50 font-semibold'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
          }`}
        >
          {isHistoryActive && (
            <span
              aria-hidden="true"
              className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-zinc-950 dark:bg-zinc-100"
            />
          )}
          <span className="relative inline-flex items-center justify-center">
            <History className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
            {historyCount > 0 && (
              <span className="absolute -top-1.5 -right-3 min-w-[17px] h-[17px] px-1 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-xs font-semibold tabular-nums inline-flex items-center justify-center leading-none">
                {historyCount > 99 ? '99+' : historyCount}
              </span>
            )}
          </span>
          <span className="truncate max-w-full leading-tight">{t.navHistory}</span>
        </button>

        <button
          type="button"
          onClick={onSelectSaved}
          aria-current={isSavedActive ? 'page' : undefined}
          className={`relative flex flex-col items-center justify-center gap-1 min-h-[54px] py-1.5 px-1 text-xs font-medium transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
            isSavedActive
              ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
          }`}
        >
          {isSavedActive && (
            <span
              aria-hidden="true"
              className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-emerald-700 dark:bg-emerald-400"
            />
          )}
          <span className="relative inline-flex items-center justify-center">
            <Bookmark
              className={`w-[18px] h-[18px] shrink-0 ${isSavedActive ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
            {shortlistCount > 0 && (
              <span
                className={`absolute -top-1.5 -right-3 min-w-[17px] h-[17px] px-1 rounded-full font-mono text-xs font-semibold tabular-nums inline-flex items-center justify-center leading-none ${
                  isSavedActive
                    ? 'bg-emerald-700 text-white'
                    : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950'
                }`}
              >
                {shortlistCount > 99 ? '99+' : shortlistCount}
              </span>
            )}
          </span>
          <span className="truncate max-w-full leading-tight">{t.shortlistBtn}</span>
        </button>
      </div>
    </nav>
  );
}
