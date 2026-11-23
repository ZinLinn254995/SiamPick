import { useMemo, type RefObject, type SyntheticEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { resolveThemeCssPalette, type CoreColorTheme } from '../../core/coreTheme';

interface CoreWelcomeOverlayProps {
  containerRef: RefObject<HTMLDivElement | null>;
  theme: CoreColorTheme;
  interactive: boolean;
  onReturnToCore: () => void;
}

/**
 * Minimal Welcome Screen revealed smoothly ONLY AFTER the pure-black camera-shutter pause.
 * Driven at 60fps via `containerRef` opacity/transform with zero per-frame React re-renders.
 */
export function CoreWelcomeOverlay({
  containerRef,
  theme,
  interactive,
  onReturnToCore,
}: CoreWelcomeOverlayProps) {
  const palette = useMemo(() => resolveThemeCssPalette(theme), [theme]);

  const stopCanvasEvent = (e: SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={containerRef}
      aria-hidden={!interactive}
      style={{
        opacity: 0,
        transform: 'translate3d(0, 12px, 0)',
        willChange: 'opacity, transform',
      }}
      className={`absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center ${
        interactive ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <section
        aria-label="Welcome to SiamPick"
        onPointerDown={stopCanvasEvent}
        onTouchStart={stopCanvasEvent}
        className="relative z-10 flex flex-col items-center max-w-xl mx-auto"
      >
        <h1 className="font-[var(--font-display)] text-balance text-3xl sm:text-5xl font-semibold tracking-[-0.02em] text-white leading-[1.15] mb-3.5">
          Welcome to SiamPick
        </h1>

        <p className="text-base sm:text-lg font-medium text-white/85 tracking-wide leading-relaxed">
          Your Product Discovery Engine
        </p>

        {/* Subtle theme-colored hairline divider */}
        <div
          aria-hidden="true"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${palette.primary} 30%, ${palette.accent} 70%, transparent 100%)`,
          }}
          className="w-24 sm:w-32 h-px my-6 opacity-75"
        />

        <p className="text-sm sm:text-[15px] text-white/60 tracking-wide leading-relaxed mb-10">
          The engine is ready.
        </p>

        <button
          type="button"
          onClick={onReturnToCore}
          disabled={!interactive}
          style={{
            borderColor: `${palette.primary}88`,
          }}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl border bg-black/80 text-xs sm:text-[13px] font-medium tracking-wide text-white/85 hover:text-white hover:bg-white/[0.04] transition-colors duration-150 active:scale-[0.98] whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Return to Core</span>
        </button>
      </section>
    </div>
  );
}
