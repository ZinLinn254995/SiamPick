import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  formatCompactNumber,
  loadOrbitalResearchProducts,
  type OrbitalResearchProduct,
} from '../../core/coreResearchData';
import type { CoreColorTheme } from '../../core/coreTheme';
import {
  buildLivePalette,
  createExplosionParticles,
  createFloatingRadarOrbs,
  drawCardAmbientBackHalo,
  drawCardCoilingBorderLights,
  drawRadarBackground,
  drawScatterParticles,
  getRadarDeployTimings,
  lerpPalette,
  stepRadarWorldPhysics,
  updateOrbSlotsForResize,
  type CoreStreamHandoff,
  type FloatingRadarOrb,
  type LiveOrbPalette,
  type RadarEchoRipple,
  type ScatterParticle,
} from '../../core/radarOrbsRenderer';

interface CoreResearchResultScreenProps {
  screenRootRef: RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  handoff: CoreStreamHandoff | null;
  theme: CoreColorTheme;
  onExit: () => void;
}

const ENTRY_GRACE_MS = 650;
const DOUBLE_TAP_WINDOW_MS = 320;

function shortCompetitionLabel(label: OrbitalResearchProduct['competitionLabel']): string {
  if (label === 'Low') return 'Low comp';
  if (label === 'Moderate') return 'Mod comp';
  return 'High comp';
}

export function CoreResearchResultScreen({
  screenRootRef,
  isOpen,
  handoff,
  theme,
  onExit,
}: CoreResearchResultScreenProps) {
  const [products, setProducts] = useState<OrbitalResearchProduct[]>(() =>
    loadOrbitalResearchProducts()
  );
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(() => new Set());

  const backCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frontCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  const orbsRef = useRef<FloatingRadarOrb[]>([]);
  const particlesRef = useRef<ScatterParticle[]>([]);
  const ripplesRef = useRef<RadarEchoRipple[]>([]);
  const paletteRef = useRef<LiveOrbPalette>(
    buildLivePalette(theme.primaryHex, theme.accentHex)
  );
  const fallbackThemeRef = useRef<CoreColorTheme>(theme);
  fallbackThemeRef.current = theme;
  const handoffRef = useRef<CoreStreamHandoff | null>(handoff);
  handoffRef.current = handoff;

  const focusedCardIdRef = useRef<string | null>(null);
  focusedCardIdRef.current = focusedCardId;

  const openedAtRef = useRef(0);
  const pinchStartDistRef = useRef<number | null>(null);
  const exitTriggeredRef = useRef(false);
  const lastEmptyTapRef = useRef<{ time: number; x: number; y: number }>({
    time: 0,
    x: 0,
    y: 0,
  });

  const dragStateRef = useRef<{
    cardId: string | null;
    pointerId: number | null;
    offsetX: number;
    offsetY: number;
    lastX: number;
    lastY: number;
    lastTime: number;
    movedPx: number;
  }>({
    cardId: null,
    pointerId: null,
    offsetX: 0,
    offsetY: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    movedPx: 0,
  });

  const hoveredCardIdRef = useRef<string | null>(null);

  // Rank-ordered products strictly by overall research score
  const rankedProducts = useMemo<OrbitalResearchProduct[]>(() => {
    return [...products].sort(
      (a, b) => b.overallScore - a.overallScore || b.monthlySales - a.monthlySales
    );
  }, [products]);

  const rankedProductsRef = useRef(rankedProducts);
  rankedProductsRef.current = rankedProducts;

  const tryExitWithGrace = useCallback(() => {
    if (exitTriggeredRef.current) return;
    if (performance.now() - openedAtRef.current < ENTRY_GRACE_MS) return;
    exitTriggeredRef.current = true;
    onExit();
  }, [onExit]);

  // Refresh research data & reset focus state whenever screen opens
  useEffect(() => {
    if (!isOpen) return;
    openedAtRef.current = performance.now();
    exitTriggeredRef.current = false;
    pinchStartDistRef.current = null;
    dragStateRef.current.cardId = null;
    dragStateRef.current.pointerId = null;
    setFocusedCardId(null);

    const loaded = loadOrbitalResearchProducts();
    setProducts(loaded);
  }, [isOpen]);

  // Keyboard Escape smoothly unfocuses active card or returns to the 3D Main Core
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (focusedCardIdRef.current !== null) {
          setFocusedCardId(null);
        } else {
          onExit();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onExit]);

  // Full-bleed 60fps Radar Scan + Coiling Card Border Lights + GPU-Synced Ranked Image Cards Loop
  useEffect(() => {
    if (!isOpen) return;
    const backCanvas = backCanvasRef.current;
    const frontCanvas = frontCanvasRef.current;
    if (!backCanvas || !frontCanvas) return;
    const backCtx = backCanvas.getContext('2d', { alpha: true });
    const frontCtx = frontCanvas.getContext('2d', { alpha: true });
    if (!backCtx || !frontCtx) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

    let width = window.innerWidth || 1024;
    let height = window.innerHeight || 768;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resizeCanvases = (recomputeSlots: boolean) => {
      width = window.innerWidth || 1024;
      height = window.innerHeight || 768;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelW = Math.max(1, Math.floor(width * dpr));
      const pixelH = Math.max(1, Math.floor(height * dpr));

      backCanvas.width = pixelW;
      backCanvas.height = pixelH;
      backCanvas.style.width = `${width}px`;
      backCanvas.style.height = `${height}px`;

      frontCanvas.width = pixelW;
      frontCanvas.height = pixelH;
      frontCanvas.style.width = `${width}px`;
      frontCanvas.style.height = `${height}px`;

      if (recomputeSlots && orbsRef.current.length > 0) {
        updateOrbSlotsForResize(orbsRef.current, width, height);
      }
    };

    resizeCanvases(false);

    // Spawn 8 Rank-ordered Image Card physics slots + ambient stardust mist
    orbsRef.current = createFloatingRadarOrbs(rankedProductsRef.current, width, height);
    particlesRef.current = createExplosionParticles(width, height, orbsRef.current.length);
    ripplesRef.current = [];

    const readLiveTargetPalette = (): LiveOrbPalette => {
      const rootStyle = screenRootRef.current?.style;
      const livePrimary =
        rootStyle?.getPropertyValue('--sp-core-primary').trim() ||
        fallbackThemeRef.current.primaryHex;
      const liveAccent =
        rootStyle?.getPropertyValue('--sp-core-accent').trim() ||
        fallbackThemeRef.current.accentHex;
      return buildLivePalette(livePrimary, liveAccent);
    };

    paletteRef.current = readLiveTargetPalette();

    const handleResize = () => resizeCanvases(true);
    window.addEventListener('resize', handleResize);

    let rafId = 0;
    const startTs = performance.now();
    let lastTs = startTs;
    let sweepAngle = -Math.PI * 0.5;
    const timings = getRadarDeployTimings(reducedMotion);
    const initialCoreRadiusPx = Math.max(
      24,
      handoffRef.current?.coreRadiusPx ?? Math.min(width, height) * 0.14
    );
    const initialSpinVelocity = handoffRef.current?.spinVelocity ?? 5.2;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      const elapsed = (now - startTs) / 1000;

      // Smoothly sync live Core colors (including Auto Color 60fps morphing)
      const targetPalette = readLiveTargetPalette();
      lerpPalette(paletteRef.current, targetPalette, 1 - Math.exp(-10 * dt));
      const palette = paletteRef.current;

      // Start rotating the 360° radar sweep beam ONLY after all 8 Cards finish coiling & Radar unfolds from center
      const prevSweep = sweepAngle;
      const radarSweepActive = elapsed >= timings.sweepStart + 0.14;
      if (elapsed >= timings.sweepStart) {
        const sweepRamp = Math.min(1, (elapsed - timings.sweepStart) / 0.52);
        const sweepSpeed = (reducedMotion ? 0.16 : 0.56) * sweepRamp;
        sweepAngle = (sweepAngle + sweepSpeed * dt) % (Math.PI * 2);
      }

      // Step zero-G floating Ranked Image Card physics, coiling handoff & radar pings
      stepRadarWorldPhysics({
        orbs: orbsRef.current,
        particles: particlesRef.current,
        ripples: ripplesRef.current,
        dt,
        elapsed,
        width,
        height,
        prevSweepAngle: prevSweep,
        nextSweepAngle: sweepAngle,
        radarSweepActive,
        coreRadiusPx: initialCoreRadiusPx,
        spinVelocity: initialSpinVelocity,
        draggedOrbId: dragStateRef.current.cardId,
        focusedOrbId: focusedCardIdRef.current,
        reducedMotion,
      });

      const orbs = orbsRef.current;
      const focusedId = focusedCardIdRef.current;
      const draggedId = dragStateRef.current.cardId;

      // LAYER 1 (Back Canvas): Transparent systematic center-outward Radar + Mist + Soft Card Back-Halos
      backCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRadarBackground(
        backCtx,
        width,
        height,
        sweepAngle,
        elapsed,
        palette,
        ripplesRef.current,
        reducedMotion
      );
      drawScatterParticles(backCtx, particlesRef.current, elapsed, palette);

      for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i];
        const isFocused = orb.id === focusedId;
        const isDragged = orb.id === draggedId;
        const dimFactor = focusedId && !isFocused && !isDragged ? 0.42 : 1;
        drawCardAmbientBackHalo(backCtx, orb, palette, isFocused, isDragged, dimFactor);
      }

      // LAYER 2 (DOM Ranked Image Cards): 60fps imperative GPU transform + crisp reveal sync
      for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i];
        const el = cardRefs.current.get(orb.id);
        if (!el) continue;

        const isFocused = orb.id === focusedId;
        const isDragged = orb.id === draggedId;
        const dimAlpha = focusedId && !isFocused && !isDragged ? 0.52 : 1;
        const opacity = orb.labelOpacity * dimAlpha;

        el.style.width = `${orb.cardWidth.toFixed(1)}px`;
        el.style.height = `${orb.cardHeight.toFixed(1)}px`;
        el.style.borderRadius = `${orb.cornerRadius}px`;
        el.style.opacity = opacity.toFixed(3);
        el.style.zIndex = isDragged ? '35' : isFocused ? '30' : String(10 + (8 - orb.rank));
        el.style.pointerEvents = orb.coilProgress > 0.35 ? 'auto' : 'none';
        el.style.transform = `translate3d(${(orb.x - orb.cardWidth * 0.5).toFixed(1)}px, ${(orb.y - orb.cardHeight * 0.5).toFixed(1)}px, 0) scale(${orb.currentScale.toFixed(4)})`;
      }

      // LAYER 3 (Front Canvas): Living Swirling Plasma Light Ribbons Coiling Around Every Card Border!
      frontCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      frontCtx.clearRect(0, 0, width, height);

      // Draw non-focused card borders first, then mask out & draw focused/dragged card border on top
      for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i];
        if (orb.id === focusedId || orb.id === draggedId) continue;
        const dimFactor = focusedId ? 0.45 : 1;
        drawCardCoilingBorderLights(
          frontCtx,
          orb,
          elapsed,
          palette,
          false,
          false,
          reducedMotion,
          dimFactor
        );
      }
      for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i];
        if (orb.id !== focusedId && orb.id !== draggedId) continue;

        // Cleanly occlude any neighbor ribbons behind the active focused/dragged card
        const cw = orb.cardWidth * orb.currentScale;
        const ch = orb.cardHeight * orb.currentScale;
        const cr = orb.cornerRadius * orb.currentScale;
        const rx = orb.x - cw * 0.5;
        const ry = orb.y - ch * 0.5;
        frontCtx.save();
        frontCtx.globalCompositeOperation = 'destination-out';
        frontCtx.beginPath();
        frontCtx.roundRect(rx, ry, cw, ch, cr);
        frontCtx.fillStyle = '#000';
        frontCtx.fill();
        frontCtx.restore();

        drawCardCoilingBorderLights(
          frontCtx,
          orb,
          elapsed,
          palette,
          orb.id === focusedId,
          orb.id === draggedId,
          reducedMotion,
          1
        );
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, rankedProducts, screenRootRef]);

  // Hit-test Ranked Image Cards respecting visual z-order (focused/dragged card on top)
  const findCardAtPoint = (clientX: number, clientY: number): FloatingRadarOrb | null => {
    const orbs = orbsRef.current;
    const focusedId = focusedCardIdRef.current;

    const hitsOrb = (orb: FloatingRadarOrb): boolean => {
      if (orb.coilProgress < 0.35) return false;
      const halfW = orb.cardWidth * orb.currentScale * 0.5 + 4;
      const halfH = orb.cardHeight * orb.currentScale * 0.5 + 4;
      return Math.abs(clientX - orb.x) <= halfW && Math.abs(clientY - orb.y) <= halfH;
    };

    if (focusedId) {
      const focusedOrb = orbs.find((o) => o.id === focusedId);
      if (focusedOrb && hitsOrb(focusedOrb)) return focusedOrb;
    }

    for (let i = 0; i < orbs.length; i++) {
      if (hitsOrb(orbs[i])) return orbs[i];
    }
    return null;
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!isOpen) return;
    e.stopPropagation();
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const hitCard = findCardAtPoint(e.clientX, e.clientY);
    if (hitCard) {
      hitCard.wobbleEnergy = Math.min(2.0, hitCard.wobbleEnergy + 0.85);
      dragStateRef.current = {
        cardId: hitCard.id,
        pointerId: e.pointerId,
        offsetX: hitCard.x - e.clientX,
        offsetY: hitCard.y - e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        lastTime: performance.now(),
        movedPx: 0,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture unavailable
      }
      return;
    }

    // Tapping empty radar space unfocuses active card, or double-tap returns to 3D Main Core
    const now = performance.now();
    const prevTap = lastEmptyTapRef.current;
    const distFromPrev = Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y);
    if (now - prevTap.time < DOUBLE_TAP_WINDOW_MS && distFromPrev < 54) {
      lastEmptyTapRef.current = { time: 0, x: 0, y: 0 };
      tryExitWithGrace();
      return;
    }

    lastEmptyTapRef.current = { time: now, x: e.clientX, y: e.clientY };
    if (focusedCardIdRef.current !== null) {
      setFocusedCardId(null);
    }
    ripplesRef.current.push({
      x: e.clientX,
      y: e.clientY,
      radius: 8,
      maxRadius: 96,
      alpha: 0.45,
      useAccent: false,
    });
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!isOpen) return;

    const drag = dragStateRef.current;
    if (drag.cardId && drag.pointerId === e.pointerId) {
      const card = orbsRef.current.find((o) => o.id === drag.cardId);
      if (!card) return;

      const now = performance.now();
      const dt = Math.max(0.008, (now - drag.lastTime) / 1000);
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      drag.movedPx += Math.hypot(dx, dy);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      drag.lastTime = now;

      card.x = e.clientX + drag.offsetX;
      card.y = e.clientY + drag.offsetY;
      card.vx = card.vx * 0.4 + (dx / dt) * 0.6;
      card.vy = card.vy * 0.4 + (dy / dt) * 0.6;
      card.wobbleEnergy = Math.min(2.0, card.wobbleEnergy + Math.hypot(dx, dy) * 0.012);
      return;
    }

    // Subtle desktop hover border-light surge when gliding across a Ranked Image Card
    if (e.pointerType === 'mouse') {
      const hovered = findCardAtPoint(e.clientX, e.clientY);
      const nextHoverId = hovered?.id ?? null;
      if (nextHoverId && nextHoverId !== hoveredCardIdRef.current && hovered) {
        hovered.wobbleEnergy = Math.min(1.5, hovered.wobbleEnergy + 0.55);
      }
      hoveredCardIdRef.current = nextHoverId;
    }
  };

  const finishPointerDrag = (pointerId: number) => {
    const drag = dragStateRef.current;
    if (!drag.cardId || drag.pointerId !== pointerId) return;

    const card = orbsRef.current.find((o) => o.id === drag.cardId);
    const wasTap = drag.movedPx < 10;

    drag.cardId = null;
    drag.pointerId = null;

    if (card) {
      const maxFling = 420;
      const speed = Math.hypot(card.vx, card.vy);
      if (speed > maxFling) {
        card.vx = (card.vx / speed) * maxFling;
        card.vy = (card.vy / speed) * maxFling;
      }
      if (wasTap) {
        card.wobbleEnergy = 1.65;
        card.pingEnergy = 1;
        ripplesRef.current.push({
          x: card.x,
          y: card.y,
          radius: Math.max(card.cardWidth, card.cardHeight) * 0.46,
          maxRadius: Math.max(card.cardWidth, card.cardHeight) * 1.28,
          alpha: 0.78,
          useAccent: true,
        });
        setFocusedCardId((prev) => (prev === card.id ? null : card.id));
      }
    }
  };

  const primaryVar = `var(--sp-core-primary, ${theme.primaryHex})`;
  const accentVar = `var(--sp-core-accent, ${theme.accentHex})`;

  return (
    <section
      ref={screenRootRef}
      aria-label="SiamPick Ranked Research Image Cards"
      aria-hidden={!isOpen}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => finishPointerDrag(e.pointerId)}
      onPointerCancel={(e) => finishPointerDrag(e.pointerId)}
      onTouchStart={(e) => {
        if (!isOpen) return;
        e.stopPropagation();
        if (e.touches.length >= 2) {
          const dx = e.touches[1].clientX - e.touches[0].clientX;
          const dy = e.touches[1].clientY - e.touches[0].clientY;
          pinchStartDistRef.current = Math.hypot(dx, dy);
        }
      }}
      onTouchMove={(e) => {
        if (!isOpen) return;
        e.stopPropagation();
        if (e.touches.length >= 2 && pinchStartDistRef.current !== null) {
          const dx = e.touches[1].clientX - e.touches[0].clientX;
          const dy = e.touches[1].clientY - e.touches[0].clientY;
          const dist = Math.hypot(dx, dy);
          if (pinchStartDistRef.current - dist > 42) {
            tryExitWithGrace();
          }
        }
      }}
      onTouchEnd={() => {
        pinchStartDistRef.current = null;
      }}
      className={`fixed inset-0 z-40 w-full h-dvh overflow-hidden touch-none select-none bg-transparent transition-opacity ease-out ${
        isOpen
          ? 'opacity-100 pointer-events-auto duration-0'
          : 'opacity-0 pointer-events-none duration-300'
      }`}
    >
      {/* Layer 1: Transparent Systematic Center-Outward Radar Scan + Mist Particles + Ambient Card Back-Halos */}
      <canvas
        ref={backCanvasRef}
        className="pointer-events-none absolute inset-0 z-0 block w-full h-full"
      />

      {/* Layer 2: Rank-Ordered Provisional Product Image Cards with On-Card Details */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {rankedProducts.map((product, index) => {
          const rank = index + 1;
          const rankText = rank < 10 ? `0${rank}` : String(rank);
          const isFocused = focusedCardId === product.id;
          const hasValidImage = Boolean(product.imageUrl) && !failedImageIds.has(product.id);

          return (
            <article
              key={product.id}
              ref={(el) => {
                if (el) cardRefs.current.set(product.id, el);
                else cardRefs.current.delete(product.id);
              }}
              style={{
                opacity: 0,
                boxShadow: `0 12px 34px -10px rgba(0,0,0,0.88), inset 0 0 0 1px rgba(255,255,255,0.12)`,
              }}
              className="absolute left-0 top-0 overflow-hidden bg-[#0a0716]/90 will-change-[transform,opacity] cursor-grab active:cursor-grabbing"
            >
              {/* Full-bleed Product Image (with resilient styled fallback) */}
              {hasValidImage && product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onError={() => {
                    setFailedImageIds((prev) => {
                      const next = new Set(prev);
                      next.add(product.id);
                      return next;
                    });
                  }}
                  className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-300"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    background: `radial-gradient(circle at 35% 28%, ${accentVar}33, ${primaryVar}22 52%, #090614 100%)`,
                  }}
                >
                  <span className="font-mono text-2xl font-semibold text-white/30">
                    #{rankText}
                  </span>
                </div>
              )}

              {/* Measured Top & Bottom Contrast Scrim ensuring >7:1 legibility over any product photo */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background: isFocused
                    ? 'linear-gradient(180deg, rgba(5,3,14,0.72) 0%, rgba(5,3,14,0.38) 38%, rgba(4,2,12,0.88) 68%, rgba(3,2,10,0.97) 100%)'
                    : 'linear-gradient(180deg, rgba(5,3,14,0.62) 0%, rgba(5,3,14,0.08) 34%, rgba(4,2,12,0.72) 66%, rgba(3,2,10,0.95) 100%)',
                }}
              />

              {/* Provisional Card Content: Top Rank Header + Bottom Product Details */}
              <div className="relative z-10 flex h-full w-full flex-col justify-between p-2.5 sm:p-3.5">
                {/* Top Row: Clean Unboxed Rank & Overall Score (Zero Pill Enclosures) */}
                <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                  <span
                    className="text-[11px] sm:text-[13px] font-bold tracking-[0.08em]"
                    style={{
                      color: accentVar,
                      textShadow: `0 1px 10px rgba(0,0,0,0.95), 0 0 12px ${primaryVar}`,
                    }}
                  >
                    #{rankText}
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-medium text-white/85 drop-shadow-[0_1px_6px_rgba(0,0,0,0.95)]">
                    {product.overallScore} pts
                  </span>
                </div>

                {/* Bottom Details Block written cleanly on the Image Card */}
                <div className="flex flex-col gap-1">
                  <h3 className="text-[11.5px] sm:text-[13.5px] font-semibold leading-snug tracking-[0.01em] text-white line-clamp-2 drop-shadow-[0_1px_8px_rgba(0,0,0,0.95)]">
                    {product.name}
                  </h3>

                  {/* Primary Pricing & Affiliate Commission Line */}
                  <div className="flex flex-wrap items-center gap-x-1.5 font-mono tabular-nums text-[10px] sm:text-[11.5px] font-medium text-white/95">
                    <span>฿{product.priceThb.toLocaleString()}</span>
                    <span aria-hidden="true" className="text-white/35">
                      ·
                    </span>
                    <span style={{ color: accentVar }}>
                      {product.commissionPct}% (฿{product.commissionThb})
                    </span>
                  </div>

                  {/* Sales Velocity, Growth & Competition Line */}
                  <div className="flex flex-wrap items-center gap-x-1.5 font-mono tabular-nums text-[9.5px] sm:text-[10.5px] text-white/75">
                    <span>{formatCompactNumber(product.monthlySales)}/mo</span>
                    <span aria-hidden="true" className="text-white/30">
                      ·
                    </span>
                    <span className="text-emerald-300/95">+{product.growthPct}%</span>
                    <span aria-hidden="true" className="hidden sm:inline text-white/30">
                      ·
                    </span>
                    <span className="hidden sm:inline text-white/70">
                      {shortCompetitionLabel(product.competitionLabel)}
                    </span>
                  </div>

                  {/* Provisional Expanded Details revealed smoothly when Card is tapped */}
                  {isFocused && (
                    <div className="mt-1 border-t border-white/15 pt-1.5 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2 text-[9.5px] sm:text-[10.5px] text-white/75 truncate">
                        <span className="truncate">{product.shopName}</span>
                        <span className="shrink-0 text-white/55">{product.categoryLabel}</span>
                      </div>
                      <p className="text-[9.5px] sm:text-[10.5px] leading-snug text-white/85 line-clamp-2">
                        {product.insight}
                      </p>
                      <div className="font-mono tabular-nums text-[9px] sm:text-[10px] text-white/65">
                        <span>Video {product.aiVideoScore}</span>
                        <span aria-hidden="true" className="mx-1 text-white/30">
                          ·
                        </span>
                        <span style={{ color: accentVar }}>{product.angleTag}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Layer 3: Living Swirling Luminous Plasma Ribbons Coiling Continuously Around Every Card Border */}
      <canvas
        ref={frontCanvasRef}
        className="pointer-events-none absolute inset-0 z-40 block w-full h-full"
      />
    </section>
  );
}
