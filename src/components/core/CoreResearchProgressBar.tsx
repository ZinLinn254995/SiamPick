import type { RefObject } from 'react';
import type { CoreColorTheme } from '../../core/coreTheme';
import type { ResearchProgressSnapshot } from '../../core/DigitalCoreEngine';

interface CoreResearchProgressBarProps {
  snapshot: ResearchProgressSnapshot;
  anchorRef: RefObject<HTMLDivElement | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  barFillRef: RefObject<HTMLDivElement | null>;
  theme: CoreColorTheme;
}

export function CoreResearchProgressBar({
  snapshot,
  anchorRef,
  rootRef,
  barFillRef,
  theme,
}: CoreResearchProgressBarProps) {
  const isVisible = snapshot.status !== 'hidden';
  const isComplete = snapshot.status === 'complete' || snapshot.status === 'launching';
  const isRollingBack = snapshot.status === 'rolling_back';

  // CSS custom properties --sp-core-primary / --sp-core-accent are updated directly
  // at 60fps by DigitalCoreEngine (tracking both Color Studio + Auto Color live morphing)
  // without React overwriting them on percent updates.
  const primaryVar = `var(--sp-core-primary, ${theme.primaryHex})`;
  const accentVar = `var(--sp-core-accent, ${theme.accentHex})`;

  return (
    <div
      ref={anchorRef}
      className="pointer-events-none absolute inset-x-0 top-[27%] -translate-y-1/2 flex justify-center px-4"
    >
      <div
        ref={rootRef}
        role="progressbar"
        aria-label="Research engine progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={snapshot.percent}
        aria-hidden={!isVisible}
        className={`flex flex-col items-center transition-[opacity,transform] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.96]'
        }`}
      >
        {/* Clean Status Text Indicating Research Engine Started */}
        <p
          style={
            isComplete
              ? {
                  color: accentVar,
                  filter: `drop-shadow(0 0 10px ${primaryVar})`,
                }
              : undefined
          }
          className={`mb-1.5 text-[11px] sm:text-[12px] font-medium tracking-[0.14em] whitespace-nowrap transition-[color,opacity,filter] duration-200 ${
            isComplete
              ? 'opacity-95'
              : isRollingBack
                ? 'text-white/42 drop-shadow-[0_1px_6px_rgba(0,0,0,0.85)]'
                : 'text-white/75 drop-shadow-[0_1px_8px_rgba(0,0,0,0.88)]'
          }`}
        >
          {isComplete ? 'Research engine ready' : 'Research engine started'}
        </p>

        {/* Large Live Tabular Percentage Number */}
        <div
          style={
            isComplete
              ? {
                  color: accentVar,
                  filter: `drop-shadow(0 0 16px ${primaryVar})`,
                }
              : undefined
          }
          className={`flex items-baseline justify-center font-mono tabular-nums leading-none tracking-[-0.03em] transition-[color,filter,opacity] duration-200 ${
            isComplete
              ? 'opacity-100'
              : isRollingBack
                ? 'text-white/55 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]'
                : 'text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.88)]'
          }`}
        >
          <span className="text-[32px] sm:text-[36px] font-semibold">
            {snapshot.percent}
          </span>
          <span className="ml-0.5 text-[16px] sm:text-[18px] font-medium opacity-75">
            %
          </span>
        </div>

        {/* Sleek 60fps Progress Bar Strictly Synced to Live Core Color */}
        <div className="relative mt-2 h-[3.5px] w-[min(56vw,176px)] overflow-hidden rounded-full bg-white/14">
          <div
            ref={barFillRef}
            style={{
              transform: `scaleX(${snapshot.progress})`,
              background: `linear-gradient(90deg, ${primaryVar} 0%, ${accentVar} 100%)`,
              boxShadow: isComplete
                ? `0 0 16px ${accentVar}, 0 0 8px ${primaryVar}`
                : `0 0 12px ${primaryVar}`,
              filter: isComplete ? 'brightness(1.16)' : undefined,
            }}
            className="h-full w-full origin-left rounded-full will-change-transform"
          />
          {snapshot.status === 'researching' && (
            <div
              aria-hidden="true"
              className="sp-scan-beam pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-white/45 to-transparent"
            />
          )}
        </div>
      </div>
    </div>
  );
}
