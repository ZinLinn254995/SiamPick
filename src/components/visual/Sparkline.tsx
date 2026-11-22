export type SparklineTone = 'emerald' | 'amber' | 'red' | 'zinc';

export interface SparklineProps {
  points: number[];
  tone?: SparklineTone;
  width?: number;
  height?: number;
  ariaLabel?: string;
  className?: string;
}

const SPARKLINE_TONE_CLASSES: Record<SparklineTone, { stroke: string; fill: string }> = {
  emerald: {
    stroke: 'stroke-emerald-600 dark:stroke-emerald-400',
    fill: 'fill-emerald-600 dark:fill-emerald-400',
  },
  amber: {
    stroke: 'stroke-amber-600 dark:stroke-amber-400',
    fill: 'fill-amber-600 dark:fill-amber-400',
  },
  red: {
    stroke: 'stroke-red-600 dark:stroke-red-400',
    fill: 'fill-red-600 dark:fill-red-400',
  },
  zinc: {
    stroke: 'stroke-zinc-500 dark:stroke-zinc-400',
    fill: 'fill-zinc-500 dark:fill-zinc-400',
  },
};

export function Sparkline({
  points,
  tone,
  width = 88,
  height = 28,
  ariaLabel,
  className = '',
}: SparklineProps) {
  const validPoints = points.filter((p) => Number.isFinite(p));
  if (validPoints.length < 3) {
    return null;
  }

  const first = validPoints[0];
  const last = validPoints[validPoints.length - 1];
  const resolvedTone: SparklineTone =
    tone ?? (last > first ? 'emerald' : last < first ? 'red' : 'zinc');
  const styles = SPARKLINE_TONE_CLASSES[resolvedTone];

  const padX = 4;
  const padY = 4;
  const innerWidth = Math.max(1, width - padX * 2);
  const innerHeight = Math.max(1, height - padY * 2);

  const min = Math.min(...validPoints);
  const max = Math.max(...validPoints);
  const span = max - min;

  const coords = validPoints.map((val, idx) => {
    const x = padX + (idx / (validPoints.length - 1)) * innerWidth;
    const normalized = span === 0 ? 0.5 : (val - min) / span;
    const y = padY + (1 - normalized) * innerHeight;
    return { x, y };
  });

  const polylinePoints = coords.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
  const lastCoord = coords[coords.length - 1];
  const trendWord = last > first ? 'upward' : last < first ? 'downward' : 'flat';

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? `Trend sparkline (${trendWord}, ${validPoints.length} points)`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`inline-block shrink-0 overflow-visible ${className}`}
    >
      <polyline
        fill="none"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polylinePoints}
        className={styles.stroke}
      />
      <circle
        cx={lastCoord.x}
        cy={lastCoord.y}
        r={2.75}
        className={styles.fill}
      />
    </svg>
  );
}

export interface TrendDeltaProps {
  pct: number | null | undefined;
  period?: string | null;
  decimals?: number;
  className?: string;
}

export function TrendDelta({
  pct,
  period,
  decimals = 1,
  className = '',
}: TrendDeltaProps) {
  const cleanPeriod = typeof period === 'string' && period.trim().length > 0 ? period.trim() : null;

  if (typeof pct !== 'number' || !Number.isFinite(pct)) {
    return (
      <span
        aria-label="Trend unavailable"
        className={`inline-flex items-center font-mono text-xs font-medium tabular-nums text-zinc-600 dark:text-zinc-400 ${className}`}
      >
        —
      </span>
    );
  }

  const isPositive = pct > 0;
  const isNegative = pct < 0;
  const formatted = `${Math.abs(pct).toFixed(decimals)}%`;

  const chipToneClass = isPositive
    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/70'
    : isNegative
      ? 'bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 border-red-200/80 dark:border-red-800/70'
      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';

  const symbol = isPositive ? '▲' : isNegative ? '▼' : '';
  const ariaDirection = isPositive ? 'Up' : isNegative ? 'Down' : 'Unchanged';
  const ariaFull = cleanPeriod
    ? `${ariaDirection} ${formatted} (${cleanPeriod})`
    : `${ariaDirection} ${formatted}`;

  return (
    <span
      aria-label={ariaFull}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${chipToneClass} ${className}`}
    >
      {symbol && <span aria-hidden="true">{symbol}</span>}
      <span>{formatted}</span>
      {cleanPeriod && (
        <span className="font-sans font-medium">
          · {cleanPeriod}
        </span>
      )}
    </span>
  );
}
