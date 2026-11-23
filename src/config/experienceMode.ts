export type ExperienceMode = 'research-core' | 'legacy-dashboard';

/**
 * Phase 1 Experience Switch.
 *
 * Set to 'research-core' to temporarily present the isolated 3D Digital Research Core
 * experience while keeping the entire existing SiamPick dashboard, routes, state,
 * APIs, and localStorage data 100% intact and recoverable.
 *
 * To restore the existing dashboard immediately:
 *  - Change DEFAULT_EXPERIENCE_MODE to 'legacy-dashboard', OR
 *  - Open the app with query parameter `?ui=legacy`.
 */
export const DEFAULT_EXPERIENCE_MODE: ExperienceMode = 'research-core';

export function resolveExperienceMode(): ExperienceMode {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const override = params.get('ui');
      if (override === 'legacy') return 'legacy-dashboard';
      if (override === 'core') return 'research-core';
    } catch {
      // Ignore malformed URL query parameters
    }
  }
  return DEFAULT_EXPERIENCE_MODE;
}
