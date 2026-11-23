import { lazy, Suspense, useEffect } from 'react';
import { resolveExperienceMode } from './config/experienceMode';
import { ResearchCoreExperience } from './components/core/ResearchCoreExperience';

// Existing SiamPick dashboard is preserved completely untouched and loaded on demand
// whenever the experience mode is switched back to 'legacy-dashboard'.
const LegacySiamPickApp = lazy(() => import('./App'));

export function RootExperience() {
  const mode = resolveExperienceMode();

  useEffect(() => {
    document.documentElement.style.backgroundColor =
      mode === 'research-core' ? '#05020F' : '';
  }, [mode]);

  if (mode === 'legacy-dashboard') {
    return (
      <Suspense
        fallback={
          <div className="min-h-dvh flex items-center justify-center bg-[var(--sp-canvas)] text-sm text-zinc-500">
            Loading workspace...
          </div>
        }
      >
        <LegacySiamPickApp />
      </Suspense>
    );
  }

  return <ResearchCoreExperience />;
}
