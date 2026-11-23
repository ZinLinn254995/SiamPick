import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoreLifecyclePhase } from '../../core/birthTimeline';
import {
  loadSavedCoreColorTheme,
  saveCoreColorTheme,
  type CoreColorTheme,
} from '../../core/coreTheme';
import { DigitalCoreEngine } from '../../core/DigitalCoreEngine';
import { CoreColorPanel } from './CoreColorPanel';

export function ResearchCoreExperience() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<DigitalCoreEngine | null>(null);

  const [colorTheme, setColorTheme] = useState<CoreColorTheme>(() => loadSavedCoreColorTheme());
  const initialThemeRef = useRef<CoreColorTheme>(colorTheme);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const [phase, setPhase] = useState<CoreLifecyclePhase>('birth');
  const [hasInteracted, setHasInteracted] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    let engine: DigitalCoreEngine | null = null;
    try {
      engine = new DigitalCoreEngine(host, {
        initialTheme: initialThemeRef.current,
        onPhaseChange: (nextPhase) => {
          setPhase(nextPhase);
        },
        onFirstInteraction: () => {
          setHasInteracted(true);
        },
        onContextLost: () => {
          setContextLost(true);
        },
        onContextRestored: () => {
          setContextLost(false);
        },
      });
      engineRef.current = engine;
    } catch {
      setWebglError('Interactive 3D rendering requires WebGL support on this device.');
    }

    return () => {
      engineRef.current = null;
      engine?.dispose();
    };
  }, []);

  const handleColorThemeChange = useCallback((nextTheme: CoreColorTheme) => {
    setColorTheme(nextTheme);
    engineRef.current?.setColorTheme(nextTheme);
    saveCoreColorTheme(nextTheme);
    document.documentElement.style.backgroundColor = nextTheme.backdropHex;
  }, []);

  const handleReplayBirth = useCallback(() => {
    setPhase('birth');
    engineRef.current?.replayBirth();
  }, []);

  const handleToggleAdjust = useCallback(() => {
    setAdjustOpen((prev) => !prev);
  }, []);

  const isIdle = phase === 'idle';

  return (
    <main
      aria-label="SiamPick Digital Research Core"
      style={{ backgroundColor: colorTheme.backdropHex }}
      className="fixed inset-0 w-full h-dvh overflow-hidden select-none overscroll-none text-purple-50"
    >
      {/* Isolated WebGL Canvas Mount (zero React children, zero per-frame re-renders) */}
      <div
        ref={canvasHostRef}
        role="application"
        aria-label="Interactive 3D Digital Core — drag to rotate, pinch with two fingers to zoom"
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />

      {/* Graceful Fallback when WebGL is unavailable or temporarily lost */}
      {(webglError || contextLost) && (
        <div
          style={{ backgroundColor: colorTheme.backdropHex }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center"
        >
          <div className="w-24 h-24 rounded-full border border-purple-400/35 bg-[radial-gradient(circle,rgba(217,70,239,0.32)_0%,rgba(124,58,237,0.18)_48%,transparent_72%)] mb-6" />
          <h1 className="text-lg font-semibold tracking-tight text-purple-50 mb-2">
            SiamPick
          </h1>
          <p className="max-w-sm text-sm text-purple-200/65 leading-relaxed">
            {contextLost
              ? 'Graphics context interrupted. Restoring the Digital Core...'
              : webglError}
          </p>
        </div>
      )}

      {/* Minimal Semantic Overlay + Permanent Collapsible Color Studio */}
      {!webglError && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-7">
          {/* Top-center restrained brand wordmark */}
          <header
            className={`flex justify-center transition-opacity duration-1000 ease-out ${
              isIdle ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <span className="font-[var(--font-display)] text-[15px] sm:text-base font-semibold tracking-[0.22em] text-purple-50/85 whitespace-nowrap">
              SiamPick
            </span>
          </header>

          {/* Bottom cue + Permanent Color Studio */}
          <footer className="flex flex-col items-center gap-2.5">
            {!adjustOpen && (
              <p
                aria-live="polite"
                className={`text-xs sm:text-[13px] tracking-[0.14em] text-purple-200/55 transition-opacity duration-700 ease-out whitespace-nowrap ${
                  isIdle && !hasInteracted ? 'opacity-100' : 'opacity-0'
                }`}
              >
                Drag to rotate · Pinch to zoom
              </p>
            )}

            <CoreColorPanel
              theme={colorTheme}
              open={adjustOpen}
              onToggleOpen={handleToggleAdjust}
              onChange={handleColorThemeChange}
              onReplayBirth={handleReplayBirth}
              visible={isIdle}
            />
          </footer>
        </div>
      )}
    </main>
  );
}
