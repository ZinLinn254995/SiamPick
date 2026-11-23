import { Bookmark, Compass, History } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { AppView, Language } from '../types/product';
import { TRANSLATIONS } from '../i18n/translations';
import { MOTION_TRANSITIONS } from '../utils/motionPresets';

export interface MobileBottomNavProps {
  activeView: AppView;
  onSelectDiscover: () => void;
  onSelectHistory: () => void;
  onSelectSaved: () => void;
  language: Language;
}

export function MobileBottomNav({
  activeView,
  onSelectDiscover,
  onSelectHistory,
  onSelectSaved,
  language,
}: MobileBottomNavProps) {
  const t = TRANSLATIONS[language];
  const prefersReduced = useReducedMotion();
  const isDiscoverActive = activeView === 'hunting' || activeView === 'deep-dive';
  const isHistoryActive = activeView === 'history';
  const isSavedActive = activeView === 'saved';

  const tapScale = prefersReduced ? undefined : { scale: 0.95 };

  return (
    <nav
      aria-label={t.mobileNavLabel}
      className="fixed inset-x-0 bottom-0 z-40 md:hidden pointer-events-none px-3 pb-[calc(0.65rem+env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto max-w-md mx-auto rounded-2xl sp-glass p-1.5 grid grid-cols-3 gap-1">
        <motion.button
          type="button"
          onClick={onSelectDiscover}
          whileTap={tapScale}
          transition={MOTION_TRANSITIONS.snappy}
          aria-current={isDiscoverActive ? 'page' : undefined}
          className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[50px] py-1 px-1.5 rounded-xl text-[11px] font-medium transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-[#10F5A0] ${
            isDiscoverActive
              ? 'text-zinc-950 dark:text-zinc-50 font-semibold'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
          }`}
        >
          {isDiscoverActive && (
            <motion.span
              layoutId="mobile-dock-active-pill"
              transition={MOTION_TRANSITIONS.snappy}
              aria-hidden="true"
              className="absolute inset-0 rounded-xl bg-zinc-950/[0.07] dark:bg-white/[0.11] border border-zinc-950/[0.06] dark:border-white/[0.09]"
            />
          )}
          <Compass className="relative z-10 w-[18px] h-[18px] shrink-0" aria-hidden="true" />
          <span className="relative z-10 truncate max-w-full leading-snug">{t.navDiscover}</span>
        </motion.button>

        <motion.button
          type="button"
          onClick={onSelectHistory}
          whileTap={tapScale}
          transition={MOTION_TRANSITIONS.snappy}
          aria-current={isHistoryActive ? 'page' : undefined}
          className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[50px] py-1 px-1.5 rounded-xl text-[11px] font-medium transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-[#10F5A0] ${
            isHistoryActive
              ? 'text-zinc-950 dark:text-zinc-50 font-semibold'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
          }`}
        >
          {isHistoryActive && (
            <motion.span
              layoutId="mobile-dock-active-pill"
              transition={MOTION_TRANSITIONS.snappy}
              aria-hidden="true"
              className="absolute inset-0 rounded-xl bg-zinc-950/[0.07] dark:bg-white/[0.11] border border-zinc-950/[0.06] dark:border-white/[0.09]"
            />
          )}
          <History className="relative z-10 w-[18px] h-[18px] shrink-0" aria-hidden="true" />
          <span className="relative z-10 truncate max-w-full leading-snug">{t.navHistory}</span>
        </motion.button>

        <motion.button
          type="button"
          onClick={onSelectSaved}
          whileTap={tapScale}
          transition={MOTION_TRANSITIONS.snappy}
          aria-current={isSavedActive ? 'page' : undefined}
          className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[50px] py-1 px-1.5 rounded-xl text-[11px] font-medium transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
            isSavedActive
              ? 'text-emerald-700 dark:text-[#10F5A0] font-semibold'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
          }`}
        >
          {isSavedActive && (
            <motion.span
              layoutId="mobile-dock-active-pill"
              transition={MOTION_TRANSITIONS.snappy}
              aria-hidden="true"
              className="absolute inset-0 rounded-xl bg-emerald-500/12 dark:bg-[#10F5A0]/14 border border-emerald-500/25 dark:border-[#10F5A0]/25"
            />
          )}
          <Bookmark
            className={`relative z-10 w-[18px] h-[18px] shrink-0 ${isSavedActive ? 'fill-current' : ''}`}
            aria-hidden="true"
          />
          <span className="relative z-10 truncate max-w-full leading-snug">{t.shortlistBtn}</span>
        </motion.button>
      </div>
    </nav>
  );
}
