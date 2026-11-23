import { motion, useReducedMotion } from 'motion/react';
import { MOTION_DURATIONS, MOTION_TRANSITIONS } from '../../utils/motionPresets';
import { AnimatedNumber } from './AnimatedNumber';

export type ScoreRingTone = 'emerald' | 'amber' | 'red' | 'zinc';

export interface ScoreRingProps {
  value: number;
  max?: number;
  size?: number;
  label?: string;
  tone?: ScoreRingTone;
  animate?: boolean;
  className?: string;
}

const TONE_STYLES: Record<ScoreRingTone, { stroke: string; text: string }> = {
  emerald: {
    stroke: 'stroke-emerald-600 dark:stroke-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  amber: {
    stroke: 'stroke-amber-600 dark:stroke-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
  },
  red: {
    stroke: 'stroke-red-600 dark:stroke-red-400',
    text: 'text-red-700 dark:text-red-300',
  },
  zinc: {
    stroke: 'stroke-zinc-500 dark:stroke-zinc-400',
    text: 'text-zinc-900 dark:text-zinc-100',
  },
};

function resolveAutoTone(value: number, max: number): ScoreRingTone {
  if (!Number.isFinite(value) || max <= 0) return 'zinc';
  const pct = (value / max) * 100;
  if (pct >= 70) return 'emerald';
  if (pct >= 40) return 'amber';
  return 'red';
}

export function ScoreRing({
  value,
  max = 100,
  size = 96,
  label,
  tone,
  animate = false,
  className = '',
}: ScoreRingProps) {
  const prefersReduced = useReducedMotion();
  const safeMax = max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(safeMax, value)) : 0;
  const shouldAnimate = animate && !prefersReduced;

  const ratio = safeValue / safeMax;
  const resolvedTone = tone ?? resolveAutoTone(safeValue, safeMax);
  const styles = TONE_STYLES[resolvedTone];

  const strokeWidth = Math.max(6, Math.round(size * 0.085));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetDashOffset = circumference * (1 - ratio);
  const isInteger = Number.isInteger(safeValue);
  const displayNumber = isInteger ? String(safeValue) : safeValue.toFixed(1);

  const numberSizeClass =
    size >= 112
      ? 'text-3xl'
      : size >= 84
        ? 'text-2xl'
        : size >= 64
          ? 'text-lg'
          : 'text-sm';

  const ariaText = label
    ? `${label}: ${displayNumber} / ${safeMax}`
    : `${displayNumber} / ${safeMax}`;

  return (
    <div
      role="img"
      aria-label={ariaText}
      className={`inline-flex flex-col items-center gap-1.5 shrink-0 ${className}`}
    >
      <div className="relative inline-flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-zinc-200 dark:stroke-zinc-800"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={shouldAnimate ? { strokeDashoffset: circumference } : false}
            animate={{ strokeDashoffset: targetDashOffset }}
            transition={shouldAnimate ? MOTION_TRANSITIONS.ticker : { duration: 0 }}
            className={styles.stroke}
          />
        </svg>

        <span
          className={`absolute inset-0 flex items-center justify-center font-mono font-bold tabular-nums leading-none ${numberSizeClass} ${styles.text}`}
        >
          {shouldAnimate ? (
            <AnimatedNumber
              value={safeValue}
              decimals={isInteger ? 0 : 1}
              durationMs={MOTION_DURATIONS.ticker * 1000}
            />
          ) : (
            displayNumber
          )}
        </span>
      </div>

      {label && (
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 text-center leading-snug">
          {label}
        </span>
      )}
    </div>
  );
}
