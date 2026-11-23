import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Radar,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type {
  Language,
  OpportunityEvaluation,
  ProductDecisionSummary,
  ResearchProduct,
} from '../types/product';
import { formatThb } from '../utils/format';
import { MOTION_TRANSITIONS, TACTILE_INTERACTIONS } from '../utils/motionPresets';
import {
  buildMarketOpportunityMatrixData,
  type MarketOpportunityMatrixPoint,
  type MatrixQuadrant,
  type MatrixYAxisMode,
} from '../utils/technicalAnalysis';

export interface MarketOpportunityMatrixProps {
  products: readonly ResearchProduct[];
  evaluations: Map<string, OpportunityEvaluation>;
  decisions?: Map<string, ProductDecisionSummary>;
  onOpenReport: (product: ResearchProduct) => void;
  language: Language;
  className?: string;
}

const SVG_WIDTH = 640;
const SVG_HEIGHT = 360;
const PLOT_LEFT = 54;
const PLOT_RIGHT = 616;
const PLOT_TOP = 28;
const PLOT_BOTTOM = 314;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;

const PAD_X_RATIO = 0.07;
const PAD_Y_RATIO = 0.1;

function mapNormToPlotX(norm: number): number {
  const padded = PAD_X_RATIO + norm * (1 - PAD_X_RATIO * 2);
  return PLOT_LEFT + padded * PLOT_W;
}

function mapNormToPlotY(norm: number): number {
  const padded = PAD_Y_RATIO + norm * (1 - PAD_Y_RATIO * 2);
  return PLOT_BOTTOM - padded * PLOT_H;
}

function formatCompactAxisValue(value: number, mode: MatrixYAxisMode): string {
  if (mode === 'score') {
    return `${Math.round(value)} pt`;
  }
  if (value >= 1_000_000) {
    return `฿${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `฿${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  }
  return `฿${Math.round(value)}`;
}

function getQuadrantMeta(quadrant: MatrixQuadrant, isMy: boolean): {
  label: string;
  badgeClass: string;
} {
  switch (quadrant) {
    case 'golden-zone':
      return {
        label: isMy ? 'Golden Zone (အခွင့်အလမ်းအကောင်းဆုံး)' : 'Golden Zone',
        badgeClass:
          'bg-emerald-500/12 text-emerald-700 dark:bg-[#10F5A0]/14 dark:text-[#10F5A0] border-emerald-500/30 dark:border-[#10F5A0]/30',
      };
    case 'crowded-giants':
      return {
        label: isMy ? 'Crowded Giants (ပြိုင်ဆိုင်မှုများ)' : 'Crowded Giants',
        badgeClass:
          'bg-cyan-500/12 text-cyan-700 dark:bg-[#25F4EE]/14 dark:text-[#25F4EE] border-cyan-500/30 dark:border-[#25F4EE]/30',
      };
    case 'early-quiet':
      return {
        label: isMy ? 'Early / Quiet (အစောပိုင်း)' : 'Early & Quiet',
        badgeClass:
          'bg-amber-500/12 text-amber-700 dark:bg-amber-400/14 dark:text-amber-300 border-amber-500/30 dark:border-amber-400/30',
      };
    case 'red-ocean':
      return {
        label: isMy ? 'Red Ocean (ပြိုင်ဆိုင်မှုပြင်းထန်)' : 'Red Ocean',
        badgeClass:
          'bg-rose-500/12 text-rose-700 dark:bg-[#FE2C55]/14 dark:text-[#FE2C55] border-rose-500/30 dark:border-[#FE2C55]/30',
      };
  }
}

function getPointVisualStyle(
  point: MarketOpportunityMatrixPoint,
  decision?: ProductDecisionSummary
): {
  fillClass: string;
  strokeClass: string;
  isGolden: boolean;
} {
  if (point.quadrant === 'golden-zone') {
    return {
      fillClass: 'fill-emerald-500/85 dark:fill-[#10F5A0]/85',
      strokeClass: 'stroke-emerald-700 dark:stroke-[#10F5A0]',
      isGolden: true,
    };
  }
  if (decision?.verdict === 'recommended') {
    return {
      fillClass: 'fill-emerald-500/75 dark:fill-[#10F5A0]/75',
      strokeClass: 'stroke-emerald-600 dark:stroke-[#10F5A0]',
      isGolden: false,
    };
  }
  if (point.quadrant === 'crowded-giants') {
    return {
      fillClass: 'fill-cyan-500/80 dark:fill-[#25F4EE]/80',
      strokeClass: 'stroke-cyan-700 dark:stroke-[#25F4EE]',
      isGolden: false,
    };
  }
  if (point.quadrant === 'early-quiet') {
    return {
      fillClass: 'fill-amber-500/80 dark:fill-amber-400/80',
      strokeClass: 'stroke-amber-700 dark:stroke-amber-300',
      isGolden: false,
    };
  }
  return {
    fillClass: 'fill-zinc-500/75 dark:fill-zinc-400/75',
    strokeClass: 'stroke-zinc-700 dark:stroke-zinc-300',
    isGolden: false,
  };
}

export function MarketOpportunityMatrix({
  products,
  evaluations,
  decisions,
  onOpenReport,
  language,
  className = '',
}: MarketOpportunityMatrixProps) {
  const isMy = language === 'my';
  const prefersReduced = useReducedMotion();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [yAxisMode, setYAxisMode] = useState<MatrixYAxisMode>('commissionPerOrder');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unplottedExpanded, setUnplottedExpanded] = useState(false);

  const matrix = useMemo(
    () => buildMarketOpportunityMatrixData(products, evaluations, yAxisMode),
    [products, evaluations, yAxisMode]
  );

  // Pick a sensible default selection (top Golden Zone point, else first point)
  useEffect(() => {
    if (matrix.points.length === 0) {
      setSelectedId(null);
      return;
    }
    const stillPresent = matrix.points.some((p) => p.product.id === selectedId);
    if (stillPresent) return;

    const topGolden = matrix.points
      .filter((p) => p.quadrant === 'golden-zone')
      .sort((a, b) => b.yValue - a.yValue)[0];
    setSelectedId((topGolden ?? matrix.points[0]).product.id);
  }, [matrix.points, selectedId]);

  const plottedCoords = useMemo(() => {
    return matrix.points.map((point) => ({
      point,
      cx: mapNormToPlotX(point.xNorm),
      cy: mapNormToPlotY(point.yNorm),
    }));
  }, [matrix.points]);

  const medianSvgX = mapNormToPlotX(matrix.medianXNorm);
  const medianSvgY = mapNormToPlotY(matrix.medianYNorm);

  const selectedEntry = useMemo(
    () => plottedCoords.find((entry) => entry.point.product.id === selectedId) ?? null,
    [plottedCoords, selectedId]
  );

  const handleStageTap = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || plottedCoords.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const svgX = ((event.clientX - rect.left) / rect.width) * SVG_WIDTH;
    const svgY = ((event.clientY - rect.top) / rect.height) * SVG_HEIGHT;

    let nearestId: string | null = null;
    let nearestDistSq = Number.POSITIVE_INFINITY;
    const maxSnapDistSq = 46 * 46;

    for (const item of plottedCoords) {
      const dx = item.cx - svgX;
      const dy = item.cy - svgY;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq && distSq <= maxSnapDistSq) {
        nearestDistSq = distSq;
        nearestId = item.point.product.id;
      }
    }

    if (nearestId) {
      setSelectedId(nearestId);
    }
  };

  const yAxisOptions: ReadonlyArray<{
    id: MatrixYAxisMode;
    labelEn: string;
    labelMy: string;
  }> = [
    { id: 'commissionPerOrder', labelEn: '฿ Comm/Order', labelMy: '฿ ကော်မရှင်/ခု' },
    { id: 'revenue', labelEn: 'Revenue', labelMy: 'ရောင်းချဝင်ငွေ' },
    { id: 'score', labelEn: 'Score', labelMy: 'အမှတ်' },
  ];

  const activeYAxisLabel =
    yAxisMode === 'commissionPerOrder'
      ? isMy
        ? 'ကော်မရှင် / Order (THB)'
        : 'Commission / Order (THB)'
      : yAxisMode === 'revenue'
        ? isMy
          ? 'ရောင်းချဝင်ငွေ (THB)'
          : 'Revenue (THB)'
        : isMy
          ? 'Opportunity Score'
          : 'Opportunity Score';

  return (
    <section
      aria-label={isMy ? 'Golden Radar Matrix' : 'Golden Radar Opportunity Matrix'}
      className={`sp-card p-4 sm:p-5 space-y-4 ${className}`}
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5">
              <Radar
                className="w-4 h-4 text-emerald-600 dark:text-[#10F5A0] shrink-0"
                aria-hidden="true"
              />
              <h3 className="text-sm sm:text-base font-bold tracking-tight text-zinc-950 dark:text-zinc-50 leading-snug">
                {isMy ? 'Golden Radar Matrix' : 'Golden Radar Matrix'}
              </h3>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-white/[0.08] leading-snug">
              {isMy
                ? 'Batch အတွင်း နှိုင်းယှဉ်အနေအထား (Median Split)'
                : 'Batch Relative Position (Median Split)'}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {isMy
              ? 'ဘယ်ဘက်အပေါ် (Golden Zone) သည် Creator နည်းပြီး ပြန်ရအကျိုးမြင့်သော Product များဖြစ်သည်။'
              : 'Top-Left (Golden Zone) highlights lower creator crowding paired with higher batch returns.'}
          </p>
        </div>

        {/* Y-Axis Segmented Switcher */}
        <div
          role="radiogroup"
          aria-label={isMy ? 'Y-Axis ရွေးချယ်ရန်' : 'Select Y-Axis metric'}
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/90 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.08] self-start sm:self-auto shrink-0"
        >
          {yAxisOptions.map((option) => {
            const isActive = yAxisMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setYAxisMode(option.id)}
                className={`relative min-h-[34px] px-2.5 sm:px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
                  isActive
                    ? 'text-zinc-950 dark:text-zinc-50 font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="matrix-yaxis-pill"
                    transition={MOTION_TRANSITIONS.snappy}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-lg bg-white dark:bg-[#182030] shadow-xs border border-zinc-200/80 dark:border-white/[0.1]"
                  />
                )}
                <span className="relative z-10">
                  {isMy ? option.labelMy : option.labelEn}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Minimum Sample Size Gate (< 8 plottable products) */}
      {!matrix.isReliable ? (
        <div className="sp-surface-muted border border-zinc-200/80 dark:border-white/[0.07] p-5 sm:p-6 text-center space-y-2.5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white dark:bg-[#0E1118] border border-zinc-200/80 dark:border-white/[0.1] mx-auto">
            <Crosshair
              className="w-5 h-5 text-zinc-500 dark:text-[#25F4EE]"
              aria-hidden="true"
            />
          </div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
            {isMy
              ? 'ယုံကြည်စိတ်ချရသော Median Split အတွက် Creator နှင့် Metric အချက်အလက်ပြည့်စုံသည့် Product 8+ ခု လိုအပ်ပါသည်'
              : '8+ products with creator & metric data required for reliable median split'}
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-md mx-auto">
            {isMy
              ? `လက်ရှိ တွက်ချက်နိုင်သော Product အရေအတွက် — ${matrix.points.length} / ${matrix.minProductsRequired} ခု (ဒေတာမပြည့်စုံသော Product များကို 0 ဟု မထည့်သွင်းပါ)`
              : `Currently plottable: ${matrix.points.length} / ${matrix.minProductsRequired} products (items with missing metrics are never plotted at 0).`}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {/* Interactive SVG Radar Stage */}
          <div className="relative rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-zinc-50/75 dark:bg-[#080B11] p-1.5 sm:p-2">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              role="img"
              aria-label={
                isMy
                  ? `Golden Radar Matrix: ${matrix.points.length} Product များ (${matrix.goldenZoneCount} ခု Golden Zone)`
                  : `Golden Radar Matrix plotting ${matrix.points.length} products (${matrix.goldenZoneCount} in Golden Zone)`
              }
              onClick={handleStageTap}
              className="w-full h-auto block select-none touch-manipulation cursor-crosshair"
            >
              {/* Plot Area Backdrop */}
              <rect
                x={PLOT_LEFT}
                y={PLOT_TOP}
                width={PLOT_W}
                height={PLOT_H}
                rx={10}
                className="fill-white/80 dark:fill-[#0B0F17]"
              />

              {/* Golden Zone (Top-Left Quadrant) Soft Mint Shading */}
              <rect
                x={PLOT_LEFT}
                y={PLOT_TOP}
                width={Math.max(0, medianSvgX - PLOT_LEFT)}
                height={Math.max(0, medianSvgY - PLOT_TOP)}
                rx={8}
                className="fill-emerald-600/[0.07] dark:fill-[#10F5A0]/[0.08]"
              />

              {/* Outer Plot Border */}
              <rect
                x={PLOT_LEFT}
                y={PLOT_TOP}
                width={PLOT_W}
                height={PLOT_H}
                rx={10}
                fill="none"
                className="stroke-zinc-200/90 dark:stroke-white/[0.08]"
                strokeWidth={1}
              />

              {/* Dashed Median Crosshairs */}
              <line
                x1={medianSvgX}
                y1={PLOT_TOP}
                x2={medianSvgX}
                y2={PLOT_BOTTOM}
                strokeDasharray="4 4"
                strokeWidth={1.25}
                className="stroke-zinc-400/75 dark:stroke-white/25"
              />
              <line
                x1={PLOT_LEFT}
                y1={medianSvgY}
                x2={PLOT_RIGHT}
                y2={medianSvgY}
                strokeDasharray="4 4"
                strokeWidth={1.25}
                className="stroke-zinc-400/75 dark:stroke-white/25"
              />

              {/* Corner Quadrant Labels */}
              <text
                x={PLOT_LEFT + 10}
                y={PLOT_TOP + 16}
                className="fill-emerald-700 dark:fill-[#10F5A0] text-[10px] font-semibold"
              >
                {isMy ? 'GOLDEN ZONE · အကောင်းဆုံး' : 'GOLDEN ZONE'}
              </text>
              <text
                x={PLOT_RIGHT - 10}
                y={PLOT_TOP + 16}
                textAnchor="end"
                className="fill-cyan-700/80 dark:fill-[#25F4EE]/80 text-[10px] font-medium"
              >
                {isMy ? 'CROWDED GIANTS' : 'CROWDED GIANTS'}
              </text>
              <text
                x={PLOT_LEFT + 10}
                y={PLOT_BOTTOM - 8}
                className="fill-amber-700/80 dark:fill-amber-300/75 text-[10px] font-medium"
              >
                {isMy ? 'EARLY & QUIET' : 'EARLY & QUIET'}
              </text>
              <text
                x={PLOT_RIGHT - 10}
                y={PLOT_BOTTOM - 8}
                textAnchor="end"
                className="fill-rose-700/75 dark:fill-[#FE2C55]/75 text-[10px] font-medium"
              >
                {isMy ? 'RED OCEAN' : 'RED OCEAN'}
              </text>

              {/* Median Labels */}
              {matrix.medianX !== null && (
                <text
                  x={medianSvgX}
                  y={PLOT_BOTTOM + 16}
                  textAnchor="middle"
                  className="fill-zinc-600 dark:fill-zinc-300 text-[10px] font-mono tabular-nums"
                >
                  {isMy ? 'အလယ်' : 'Med'}: {Math.round(matrix.medianX).toLocaleString('en-US')}
                </text>
              )}
              {matrix.medianY !== null && (
                <text
                  x={PLOT_LEFT - 6}
                  y={medianSvgY + 3}
                  textAnchor="end"
                  className="fill-zinc-600 dark:fill-zinc-300 text-[10px] font-mono tabular-nums"
                >
                  {formatCompactAxisValue(matrix.medianY, yAxisMode)}
                </text>
              )}

              {/* Axis Captions */}
              <text
                x={(PLOT_LEFT + PLOT_RIGHT) / 2}
                y={SVG_HEIGHT - 6}
                textAnchor="middle"
                className="fill-zinc-500 dark:fill-zinc-400 text-[10px] font-medium"
              >
                {isMy
                  ? 'Creator အရေအတွက် (Log Scale — ဘယ်ဘက် = ပြိုင်ဆိုင်မှုနည်း)'
                  : 'Creator Count (Log Scale — Left = Lower Crowding)'}
              </text>
              <text
                x={14}
                y={(PLOT_TOP + PLOT_BOTTOM) / 2}
                textAnchor="middle"
                transform={`rotate(-90 14 ${(PLOT_TOP + PLOT_BOTTOM) / 2})`}
                className="fill-zinc-500 dark:fill-zinc-400 text-[10px] font-medium"
              >
                {activeYAxisLabel}
              </text>

              {/* Interactive Product Bubbles (44px invisible touch targets) */}
              {plottedCoords.map(({ point, cx, cy }) => {
                const isSelected = point.product.id === selectedId;
                const decision =
                  decisions?.get(point.product.id) ??
                  decisions?.get(point.canonicalProductId);
                const visual = getPointVisualStyle(point, decision);

                return (
                  <g
                    key={point.product.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${point.product.name} — ${point.creatorNumber} creators`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(point.product.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(point.product.id);
                      }
                    }}
                    className="cursor-pointer focus:outline-none"
                  >
                    {/* Subtle Mint halo for Golden Zone bubbles */}
                    {visual.isGolden && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={point.radiusPx + 3.5}
                        fill="none"
                        className="stroke-emerald-500/45 dark:stroke-[#10F5A0]/45"
                        strokeWidth={1.25}
                      />
                    )}

                    {/* Selected focus reticle */}
                    {isSelected && (
                      <motion.circle
                        cx={cx}
                        cy={cy}
                        r={point.radiusPx + 6}
                        fill="none"
                        initial={prefersReduced ? false : { opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={MOTION_TRANSITIONS.snappy}
                        className="stroke-zinc-950 dark:stroke-white"
                        strokeWidth={1.75}
                        strokeDasharray="3 2"
                      />
                    )}

                    {/* Visible Data Bubble */}
                    <motion.circle
                      cx={cx}
                      cy={cy}
                      r={point.radiusPx}
                      initial={prefersReduced ? false : { opacity: 0, scale: 0.7 }}
                      animate={{
                        opacity: isSelected ? 1 : 0.84,
                        scale: isSelected ? 1.1 : 1,
                      }}
                      transition={MOTION_TRANSITIONS.snappy}
                      strokeWidth={isSelected ? 2 : 1.25}
                      className={`${visual.fillClass} ${visual.strokeClass}`}
                    />

                    {/* Invisible 44px diameter (r=22) touch-safe hit target */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={22}
                      fill="transparent"
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Selected Product Inspection Card */}
          <AnimatePresence mode="wait">
            {selectedEntry && (
              <motion.div
                key={selectedEntry.point.product.id}
                initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReduced ? undefined : { opacity: 0, y: -4 }}
                transition={MOTION_TRANSITIONS.crossFade}
                className="rounded-xl border border-zinc-200/90 dark:border-white/[0.09] bg-zinc-50/90 dark:bg-[#111622] p-3.5 sm:p-4 space-y-3"
              >
                {(() => {
                  const pt = selectedEntry.point;
                  const qMeta = getQuadrantMeta(pt.quadrant, isMy);
                  const metrics = pt.product.kalodataMetrics;
                  return (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {pt.product.imageVerified && pt.product.imageUrl ? (
                            <img
                              src={pt.product.imageUrl}
                              alt={pt.product.name}
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 rounded-lg object-cover border border-zinc-200/80 dark:border-white/[0.1] shrink-0 bg-white dark:bg-zinc-900"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg border border-zinc-200/80 dark:border-white/[0.1] bg-zinc-200/70 dark:bg-white/[0.06] flex items-center justify-center text-xs font-mono text-zinc-500 dark:text-zinc-400 shrink-0">
                              SKU
                            </div>
                          )}

                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold leading-snug ${qMeta.badgeClass}`}
                              >
                                {qMeta.label}
                              </span>
                              {pt.analysis.dataWindowLabel && (
                                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                                  · {pt.analysis.dataWindowLabel}
                                </span>
                              )}
                            </div>
                            <h4 className="text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50 line-clamp-2 leading-snug">
                              {isMy && pt.product.nameMy ? pt.product.nameMy : pt.product.name}
                            </h4>
                          </div>
                        </div>

                        <motion.button
                          type="button"
                          onClick={() => onOpenReport(pt.product)}
                          whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                          transition={MOTION_TRANSITIONS.snappy}
                          className="sp-btn-volt shrink-0 self-start sm:self-center text-xs min-h-[38px] px-3.5"
                        >
                          <span>{isMy ? 'Report ဖွင့်ရန်' : 'Open Report'}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        </motion.button>
                      </div>

                      {/* Absolute Metrics Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-zinc-200/75 dark:border-white/[0.07]">
                        <div className="space-y-0.5">
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                            {isMy ? 'Creators' : 'Creators'}
                          </div>
                          <div className="font-mono text-xs sm:text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                            {pt.creatorNumber.toLocaleString('en-US')}
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                            {isMy ? 'ရောင်းချဝင်ငွေ' : 'Revenue'}
                          </div>
                          <div className="font-mono text-xs sm:text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                            {formatThb(metrics?.revenueThb)}
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                            {isMy ? 'ကော်မရှင် %' : 'Comm %'}
                          </div>
                          <div className="font-mono text-xs sm:text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                            {pt.product.commissionRate !== null
                              ? `${pt.product.commissionRate}%${pt.product.commissionVerified ? '' : '*'}`
                              : '—'}
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                            {isMy ? '฿/Order' : '฿/Order'}
                          </div>
                          <div className="font-mono text-xs sm:text-sm font-semibold tabular-nums text-emerald-700 dark:text-[#10F5A0]">
                            {formatThb(pt.analysis.earningPerOrderThb)}
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                            {isMy ? 'Score' : 'Score'}
                          </div>
                          <div className="font-mono text-xs sm:text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                            {pt.evaluation ? `${pt.evaluation.totalScore}/100` : '—'}
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Sample Size & Missing Data Footer */}
      <div className="pt-2 border-t border-zinc-200/75 dark:border-white/[0.07] space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
            <span>
              {isMy ? 'Sample Size · ပြသထားသည်' : 'Sample Size: Plotted'}{' '}
              <strong className="text-zinc-900 dark:text-zinc-100">{matrix.points.length}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {isMy ? 'ဒေတာမပြည့်စုံ (မပြသ)' : 'Missing Data (Unplotted)'}:{' '}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {matrix.unplottedProducts.length}
              </strong>
            </span>
          </div>

          {matrix.unplottedProducts.length > 0 && (
            <button
              type="button"
              onClick={() => setUnplottedExpanded((prev) => !prev)}
              aria-expanded={unplottedExpanded}
              className="inline-flex items-center gap-1 min-h-[32px] px-2 py-1 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
              <span>
                {isMy
                  ? `မပြသနိုင်သော ${matrix.unplottedProducts.length} ခုကြည့်ရန်`
                  : `View ${matrix.unplottedProducts.length} unplotted`}
              </span>
              {unplottedExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
            </button>
          )}
        </div>

        <AnimatePresence>
          {unplottedExpanded && matrix.unplottedProducts.length > 0 && (
            <motion.ul
              initial={prefersReduced ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? undefined : { opacity: 0, y: -4 }}
              transition={MOTION_TRANSITIONS.accordion}
              className="rounded-xl bg-zinc-50/90 dark:bg-[#0B0E14] border border-zinc-200/80 dark:border-white/[0.07] divide-y divide-zinc-200/70 dark:divide-white/[0.06] max-h-48 overflow-y-auto"
            >
              {matrix.unplottedProducts.map((item) => (
                <li
                  key={item.product.id}
                  className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => onOpenReport(item.product)}
                    className="text-left min-w-0 flex-1 hover:underline cursor-pointer"
                  >
                    <span className="block font-medium text-zinc-900 dark:text-zinc-100 truncate leading-snug">
                      {isMy && item.product.nameMy ? item.product.nameMy : item.product.name}
                    </span>
                    <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                      {isMy ? item.missingReasonMy : item.missingReasonEn}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenReport(item.product)}
                    className="text-[11px] font-medium text-emerald-700 dark:text-[#10F5A0] hover:underline shrink-0 cursor-pointer"
                  >
                    {isMy ? 'ကြည့်ရန်' : 'Inspect'}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
