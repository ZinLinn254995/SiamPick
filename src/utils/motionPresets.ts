import type { TargetAndTransition, Transition, Variants } from 'motion/react';

/**
 * SiamPick Design System v1.0 — Centralized Motion Foundation
 *
 * All transitions and variants strictly animate GPU-composited properties
 * (`transform` and `opacity`) to sustain 60fps on Android tablets and mobile devices.
 */

export const MOTION_EASE = {
  expoOut: [0.16, 1, 0.3, 1] as const,
  standard: [0.4, 0, 0.2, 1] as const,
} as const;

export const MOTION_DURATIONS = {
  fast: 0.15,
  base: 0.22,
  weighted: 0.26,
  ticker: 0.36,
} as const;

export type MotionTransitionKey =
  | 'snappy'
  | 'weighted'
  | 'ticker'
  | 'accordion'
  | 'crossFade';

export const MOTION_TRANSITIONS: Record<MotionTransitionKey, Transition> = {
  /** Nav `layoutId` indicators, button tap, card hover, badge pops */
  snappy: {
    type: 'spring',
    stiffness: 450,
    damping: 32,
    mass: 0.8,
  },
  /** Slide-over drawers, modals, mobile bottom sheets — crisp stop, zero excessive bounce */
  weighted: {
    type: 'spring',
    stiffness: 360,
    damping: 34,
    mass: 1,
  },
  /** Money/score count-ups and SVG chart draws */
  ticker: {
    duration: MOTION_DURATIONS.ticker,
    ease: MOTION_EASE.expoOut,
  },
  /** Expandable panels, Filter Studio, Deep Dive modules */
  accordion: {
    duration: MOTION_DURATIONS.base,
    ease: MOTION_EASE.expoOut,
  },
  /** Tab content and Video Creative Studio mode switches */
  crossFade: {
    duration: 0.16,
    ease: MOTION_EASE.expoOut,
  },
};

/**
 * Android Tablet 60fps performance guardrails.
 */
export const MOTION_CAPS = {
  /** Cap card stagger entrance to the first 9 visible cards */
  MAX_STAGGER_ITEMS: 9,
  STAGGER_STEP_SEC: 0.035,
  /** Stagger step for 4-card TikTok Link X-Ray metric reveal */
  LINK_METRIC_STAGGER_SEC: 0.06,
  /** Mobile/tablet card grid `layout="position"` cap */
  MAX_LAYOUT_REFLOW_COMPACT: 12,
  /** Desktop card grid `layout="position"` cap */
  MAX_LAYOUT_REFLOW_DESKTOP: 24,
} as const;

/**
 * Computes a capped stagger delay (in seconds) for list/grid item entrances.
 * Returns `0` for negative indices and indices at or beyond `maxItems` so lower
 * cards never lag behind scroll.
 */
export function getCappedStaggerDelay(
  index: number,
  stepSec: number = MOTION_CAPS.STAGGER_STEP_SEC,
  maxItems: number = MOTION_CAPS.MAX_STAGGER_ITEMS,
): number {
  if (!Number.isFinite(index) || index < 0 || index >= maxItems) {
    return 0;
  }
  return index * stepSec;
}

/**
 * Determines whether card grid `layout="position"` reflow animations should be
 * enabled for the current viewport tier and visible item count.
 */
export function shouldEnableGridLayoutReflow(
  visibleCount: number,
  isDesktop: boolean,
): boolean {
  const maxAllowed = isDesktop
    ? MOTION_CAPS.MAX_LAYOUT_REFLOW_DESKTOP
    : MOTION_CAPS.MAX_LAYOUT_REFLOW_COMPACT;
  return visibleCount <= maxAllowed;
}

export type MotionVariantKey =
  | 'backdrop'
  | 'drawerRight'
  | 'bottomSheet'
  | 'modalScale'
  | 'popover'
  | 'cardReveal'
  | 'chipPop'
  | 'verdictStamp';

export const MOTION_VARIANTS: Record<MotionVariantKey, Variants> = {
  backdrop: {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: { duration: 0.18, ease: MOTION_EASE.standard },
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.18, ease: MOTION_EASE.standard },
    },
  },
  drawerRight: {
    initial: { x: '100%' },
    animate: {
      x: 0,
      transition: MOTION_TRANSITIONS.weighted,
    },
    exit: {
      x: '100%',
      transition: MOTION_TRANSITIONS.weighted,
    },
  },
  bottomSheet: {
    initial: { y: '100%' },
    animate: {
      y: 0,
      transition: MOTION_TRANSITIONS.weighted,
    },
    exit: {
      y: '100%',
      transition: MOTION_TRANSITIONS.weighted,
    },
  },
  modalScale: {
    initial: { opacity: 0, scale: 0.96, y: 8 },
    animate: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: MOTION_TRANSITIONS.weighted,
    },
    exit: {
      opacity: 0,
      scale: 0.97,
      y: 6,
      transition: MOTION_TRANSITIONS.weighted,
    },
  },
  popover: {
    initial: { opacity: 0, scale: 0.94, y: -4 },
    animate: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { duration: 0.16, ease: MOTION_EASE.expoOut },
    },
    exit: {
      opacity: 0,
      scale: 0.96,
      y: -4,
      transition: { duration: 0.16, ease: MOTION_EASE.expoOut },
    },
  },
  cardReveal: {
    initial: { opacity: 0, y: 10 },
    animate: (index: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: {
        duration: MOTION_DURATIONS.base,
        ease: MOTION_EASE.expoOut,
        delay: getCappedStaggerDelay(typeof index === 'number' ? index : 0),
      },
    }),
    exit: {
      opacity: 0,
      scale: 0.96,
      transition: { duration: MOTION_DURATIONS.fast, ease: MOTION_EASE.standard },
    },
  },
  chipPop: {
    initial: { opacity: 0, scale: 0.88 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: MOTION_TRANSITIONS.snappy,
    },
    exit: {
      opacity: 0,
      scale: 0.88,
      transition: MOTION_TRANSITIONS.snappy,
    },
  },
  verdictStamp: {
    initial: { opacity: 0, scale: 1.08 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: MOTION_TRANSITIONS.snappy,
    },
    exit: {
      opacity: 0,
      scale: 0.96,
      transition: { duration: MOTION_DURATIONS.fast, ease: MOTION_EASE.standard },
    },
  },
};

export type TactileInteractionKey = 'buttonTap' | 'cardHover';

export const TACTILE_INTERACTIONS: Record<TactileInteractionKey, TargetAndTransition> = {
  buttonTap: { scale: 0.97 },
  cardHover: { y: -2 },
};
