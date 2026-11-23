import { useEffect, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import { MOTION_DURATIONS, MOTION_EASE } from '../../utils/motionPresets';

export type AnimatedNumberHighlightSignal = 'none' | 'emerald-sheen' | 'emerald-pulse';

export interface AnimatedNumberProps {
  value: number;
  durationMs?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  highlightSignal?: AnimatedNumberHighlightSignal;
}

/**
 * Smoothly rolls numeric values using motion/react's `animate` driver with
 * SiamPick's expoOut ticker easing, preserving tabular alignment and snapping
 * immediately when reduced motion is preferred.
 */
export function AnimatedNumber({
  value,
  durationMs,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  highlightSignal = 'none',
}: AnimatedNumberProps) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const prefersReduced = useReducedMotion();
  const [displayValue, setDisplayValue] = useState<number>(safeValue);
  const [pulseCycle, setPulseCycle] = useState<number>(0);
  const [sheenCycle, setSheenCycle] = useState<number>(0);
  const previousRef = useRef<number>(0);
  const hasMountedRef = useRef<boolean>(false);

  useEffect(() => {
    const isInitialMount = !hasMountedRef.current;
    const from = isInitialMount ? 0 : previousRef.current;
    hasMountedRef.current = true;
    previousRef.current = safeValue;

    const durationSec =
      durationMs !== undefined ? Math.max(0, durationMs / 1000) : MOTION_DURATIONS.ticker;

    if (!prefersReduced && highlightSignal === 'emerald-sheen' && (isInitialMount || from !== safeValue)) {
      setSheenCycle((cycle) => cycle + 1);
    }

    if (prefersReduced || durationSec <= 0 || from === safeValue) {
      setDisplayValue(safeValue);
      return;
    }

    const controls = animate(from, safeValue, {
      duration: durationSec,
      ease: MOTION_EASE.expoOut,
      onUpdate: (latest) => {
        setDisplayValue(latest);
      },
      onComplete: () => {
        setDisplayValue(safeValue);
        if (highlightSignal === 'emerald-pulse') {
          setPulseCycle((cycle) => cycle + 1);
        }
      },
    });

    return () => controls.stop();
  }, [safeValue, durationMs, prefersReduced, highlightSignal]);

  const formatted =
    decimals > 0
      ? displayValue.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(displayValue).toLocaleString('en-US');

  if (highlightSignal === 'emerald-pulse' && !prefersReduced) {
    return (
      <span className={`relative inline-block tabular-nums ${className}`}>
        <motion.span
          key={pulseCycle}
          className="inline-block"
          initial={pulseCycle > 0 ? { scale: 1.045, opacity: 0.85 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.28, ease: MOTION_EASE.expoOut }}
        >
          {prefix}
          {formatted}
          {suffix}
        </motion.span>
        {pulseCycle > 0 && (
          <motion.span
            key={`pulse-tint-${pulseCycle}`}
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-1 -inset-y-0.5 rounded bg-emerald-400/20 dark:bg-emerald-400/25"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: [0, 0.85, 0], scale: [0.96, 1.03, 1] }}
            transition={{ duration: 0.36, ease: MOTION_EASE.expoOut }}
          />
        )}
      </span>
    );
  }

  if (highlightSignal === 'emerald-sheen' && !prefersReduced) {
    return (
      <span className={`relative inline-block tabular-nums ${className}`}>
        <span>
          {prefix}
          {formatted}
          {suffix}
        </span>
        {sheenCycle > 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-sm"
          >
            <motion.span
              key={`sheen-${sheenCycle}`}
              className="block h-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-emerald-300/35 to-transparent dark:via-emerald-300/25"
              initial={{ x: '-120%', opacity: 0 }}
              animate={{ x: '260%', opacity: [0, 1, 0] }}
              transition={{ duration: 0.48, ease: MOTION_EASE.expoOut }}
            />
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
