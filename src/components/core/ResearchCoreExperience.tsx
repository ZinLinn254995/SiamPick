import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoreLifecyclePhase } from '../../core/birthTimeline';
import {
  loadDynamicColorEnabled,
  loadSavedCoreColorTheme,
  saveCoreColorTheme,
  saveDynamicColorEnabled,
  type CoreColorTheme,
} from '../../core/coreTheme';
import {
  DigitalCoreEngine,
  type CorePortalHandoff,
  type ResearchProgressSnapshot,
} from '../../core/DigitalCoreEngine';
import { CoreColorPanel } from './CoreColorPanel';
import { CoreResearchProgressBar } from './CoreResearchProgressBar';
import { CoreResearchResultScreen } from './CoreResearchResultScreen';

const INITIAL_RESEARCH_SNAPSHOT: ResearchProgressSnapshot = {
  status: 'hidden',
  progress: 0,
  percent: 0,
};

export function ResearchCoreExperience() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<DigitalCoreEngine | null>(null);
  const researchAnchorRef = useRef<HTMLDivElement | null>(null);
  const researchRootRef = useRef<HTMLDivElement | null>(null);
  const researchBarFillRef = useRef<HTMLDivElement | null>(null);
  const resultScreenRootRef = useRef<HTMLDivElement | null>(null);

  const [colorTheme, setColorTheme] = useState<CoreColorTheme>(() => loadSavedCoreColorTheme());
  const initialThemeRef = useRef<CoreColorTheme>(colorTheme);
  const [dynamicColorEnabled, setDynamicColorEnabled] = useState<boolean>(() =>
    loadDynamicColorEnabled()
  );
  const initialDynamicColorRef = useRef<boolean>(dynamicColorEnabled);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const [phase, setPhase] = useState<CoreLifecyclePhase>('birth');
  const [hasInteracted, setHasInteracted] = useState(false);
  const [whitePortalOpen, setWhitePortalOpen] = useState(false);
  const [portalHandoff, setPortalHandoff] = useState<CorePortalHandoff | null>(null);
  const [researchSnapshot, setResearchSnapshot] =
    useState<ResearchProgressSnapshot>(INITIAL_RESEARCH_SNAPSHOT);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    let engine: DigitalCoreEngine | null = null;
    try {
      engine = new DigitalCoreEngine(host, {
        initialTheme: initialThemeRef.current,
        initialDynamicColor: initialDynamicColorRef.current,
        onPhaseChange: (nextPhase) => {
          setPhase(nextPhase);
        },
        onFirstInteraction: () => {
          setHasInteracted(true);
        },
        onWhitePortalChange: (isOpen, handoff) => {
          if (isOpen && handoff) {
            setPortalHandoff(handoff);
          }
          setWhitePortalOpen(isOpen);
          if (isOpen) {
            setAdjustOpen(false);
          }
        },
        onResearchProgressBar: (progress) => {
          if (researchBarFillRef.current) {
            researchBarFillRef.current.style.transform = `scaleX(${progress})`;
          }
        },
        onResearchStateChange: (snapshot) => {
          setResearchSnapshot(snapshot);
        },
        onLiveColorChange: (primaryHex, accentHex) => {
          const progressEl = researchRootRef.current;
          if (progressEl) {
            progressEl.style.setProperty('--sp-core-primary', primaryHex);
            progressEl.style.setProperty('--sp-core-accent', accentHex);
          }
          const resultEl = resultScreenRootRef.current;
          if (resultEl) {
            resultEl.style.setProperty('--sp-core-primary', primaryHex);
            resultEl.style.setProperty('--sp-core-accent', accentHex);
          }
        },
        getProgressClearanceBottomPx: () => {
          const anchor = researchAnchorRef.current;
          const host = canvasHostRef.current;
          if (!anchor || !host) {
            return (window.innerHeight || 800) * 0.32;
          }
          return anchor.getBoundingClientRect().bottom - host.getBoundingClientRect().top;
        },
        onColorThemeCommit: (committedTheme) => {
          setColorTheme(committedTheme);
          saveCoreColorTheme(committedTheme);
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
    setAdjustOpen(false);
    setWhitePortalOpen(false);
    setPhase('birth');
    engineRef.current?.replayBirth();
  }, []);

  const handleToggleAdjust = useCallback(() => {
    setAdjustOpen((prev) => !prev);
  }, []);

  const handleToggleDynamicColor = useCallback(() => {
    setDynamicColorEnabled((prev) => {
      const next = !prev;
      saveDynamicColorEnabled(next);
      engineRef.current?.setDynamicColorEnabled(next);
      return next;
    });
  }, []);

  const handleExitWhitePortal = useCallback(() => {
    engineRef.current?.exitWhitePortal();
  }, []);

  const isIdleCore = phase === 'idle' && !whitePortalOpen;
  const showColorStudio = isIdleCore;
  // Keep exact same cosmic backdrop color across the single screen (zero screen-switch snap)
  const activeBackdropHex = colorTheme.backdropHex;

  useEffect(() => {
    document.documentElement.style.backgroundColor = activeBackdropHex;
  }, [activeBackdropHex]);

  return (
    <main
      aria-label="SiamPick Digital Research Core"
      style={{
        backgroundColor: activeBackdropHex,
        WebkitTouchCallout: 'none',
      }}
      className="fixed inset-0 w-full h-dvh overflow-hidden select-none overscroll-none text-purple-50"
    >
      {/* Isolated WebGL Canvas Mount (zero React children, zero per-frame re-renders) */}
      <div
        ref={canvasHostRef}
        role="application"
        aria-label="Interactive 3D Digital Core — hold to spin up, drag to rotate, pinch with two fingers to zoom"
        className="absolute inset-0 w-full h-full touch-none cursor-grab active:cursor-grabbing"
      />

      {/* Graceful Fallback when WebGL is unavailable or temporarily lost */}
      {(webglError || contextLost) && (
        <div
          style={{ backgroundColor: colorTheme.backdropHex }}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center"
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
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-7">
          {/* Top-center restrained brand wordmark */}
          <header
            className={`flex justify-center transition-opacity duration-700 ease-out ${
              isIdleCore ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <span className="font-[var(--font-display)] text-[15px] sm:text-base font-semibold tracking-[0.22em] text-purple-50/85 whitespace-nowrap">
              SiamPick
            </span>
          </header>

          {/* Midpoint between SiamPick title and Core: activates dynamically once shrinking Core clears it */}
          <div
            className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ease-out ${
              isIdleCore ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <CoreResearchProgressBar
              snapshot={researchSnapshot}
              anchorRef={researchAnchorRef}
              rootRef={researchRootRef}
              barFillRef={researchBarFillRef}
              theme={colorTheme}
            />
          </div>

          {/* Bottom cue + Permanent Color Studio */}
          <footer className="flex flex-col items-center gap-2.5">
            {!adjustOpen && (
              <p
                aria-live="polite"
                className={`text-xs sm:text-[13px] tracking-[0.14em] text-purple-200/60 transition-opacity duration-700 ease-out whitespace-nowrap ${
                  isIdleCore && !hasInteracted ? 'opacity-100' : 'opacity-0'
                }`}
              >
                Hold to spin · Drag to rotate · Pinch to zoom
              </p>
            )}

            <CoreColorPanel
              theme={colorTheme}
              open={adjustOpen}
              dynamicColorEnabled={dynamicColorEnabled}
              onToggleDynamicColor={handleToggleDynamicColor}
              onToggleOpen={handleToggleAdjust}
              onChange={handleColorThemeChange}
              onReplayBirth={handleReplayBirth}
              visible={showColorStudio}
            />
          </footer>
        </div>
      )}

      {/* Single-Screen Continuous Liquid-River Orbs & Center-Outward Radar Layer */}
      {!webglError && (
        <CoreResearchResultScreen
          screenRootRef={resultScreenRootRef}
          isOpen={whitePortalOpen}
          handoff={portalHandoff}
          theme={colorTheme}
          onExit={handleExitWhitePortal}
        />
      )}
    </main>
  );
}
