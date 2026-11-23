import type { OrbitalResearchProduct } from './coreResearchData';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface LiveOrbPalette {
  primary: RgbColor;
  accent: RgbColor;
  hot: RgbColor;
  deep: RgbColor;
}

export interface OrbitSpark {
  angle: number;
  distFactor: number;
  speed: number;
  size: number;
  phase: number;
}

export interface PlasmaRingSpec {
  offsetDist: number;
  offsetAngle: number;
  precessSpeed: number;
  tilt: number;
  spinSpeed: number;
  rxScale: number;
  ryScale: number;
  waveFreq: number;
  waveAmp: number;
  waveSpeed: number;
  useAccent: boolean;
  alphaBoost: number;
}

export interface FloatingRadarOrb {
  id: string;
  rank: number; // 1..N
  product: OrbitalResearchProduct;
  // Home anchor in radar field (updated smoothly on resize)
  homeX: number;
  homeY: number;
  // Live position & zero-gravity velocity
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Base radius, Image Card geometry & live scale
  baseRadius: number;
  currentRadius: number;
  cardWidth: number;
  cardHeight: number;
  cornerRadius: number;
  currentScale: number;
  // Core-to-Card spiraling light stream coiling morph timing
  launchDelay: number;
  travelDur: number;
  coilDur: number;
  coilProgress: number; // 0 (uncoiled stream) -> 1 (fully coiled living card frame)
  coilLocked: boolean;
  coilAngleAccum: number; // extra rotational momentum carried over from spinning Core
  spiralTwistTurns: number; // spiral angle unwind from Core
  // Zero-gravity floating liquid droplet oscillation params (Rayleigh capillary modes)
  w2: number;
  w3: number;
  w4: number;
  p2: number;
  p3: number;
  p4: number;
  // Slow zero-G buoyant Lissajous drift params
  driftAx: number;
  driftAy: number;
  driftWx: number;
  driftWy: number;
  driftPx: number;
  driftPy: number;
  // Interactive / radar-ping energy states
  wobbleEnergy: number; // 0..2.2 (decays exponentially like water droplet surface tension)
  pingEnergy: number; // 0..1 (flashes when radar sweep crosses orb)
  labelSide: 'left' | 'right';
  // Current label anchor coordinates computed each frame for DOM callout sync
  labelX: number;
  labelY: number;
  labelOpacity: number;
  // Visual plasma rings + orbiting dust sparkles
  rings: PlasmaRingSpec[];
  sparks: OrbitSpark[];
}

export interface ScatterParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  driftAngle: number;
  driftSpeed: number;
  size: number;
  alpha: number;
  twinklePhase: number;
  twinkleSpeed: number;
  useAccent: boolean;
  birthTime: number;
  born: boolean;
  settled: number; // 0 while shedding off spiral stream -> 1 as ambient stardust
  streamOrbIndex: number;
  spawnU: number;
}

export interface RadarEchoRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  useAccent: boolean;
}

export interface CoreStreamHandoff {
  coreRadiusPx: number;
  spinVelocity: number;
}

/**
 * Choreographed single-screen transition timings:
 * 1) 0.00s -> 1.42s: Shrunken 3D Main Core expands back out & its own 16 light strands unzip and physically coil into the 8 Orbs.
 * 2) 1.42s -> 2.95s: Once all 8 Orbs finish coiling into place, Radar background deploys systematically from center outward.
 */
export function getRadarDeployTimings(reducedMotion: boolean): {
  radarStart: number;
  sweepStart: number;
} {
  if (reducedMotion) {
    return { radarStart: 0.7, sweepStart: 1.18 };
  }
  return { radarStart: 1.42, sweepStart: 2.38 };
}

const DEFAULT_PRIMARY: RgbColor = { r: 124, g: 58, b: 237 };
const DEFAULT_ACCENT: RgbColor = { r: 217, g: 70, b: 239 };

export function parseHexToRgb(hex: string, fallback: RgbColor): RgbColor {
  const cleaned = hex.trim().replace(/^#/, '');
  if (cleaned.length === 6) {
    const num = Number.parseInt(cleaned, 16);
    if (!Number.isNaN(num)) {
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
      };
    }
  } else if (cleaned.length === 3) {
    const r = Number.parseInt(cleaned[0] + cleaned[0], 16);
    const g = Number.parseInt(cleaned[1] + cleaned[1], 16);
    const b = Number.parseInt(cleaned[2] + cleaned[2], 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return { r, g, b };
    }
  }
  return fallback;
}

export function mixRgb(a: RgbColor, b: RgbColor, t: number): RgbColor {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

export function rgbaStr(c: RgbColor, alpha: number): string {
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

export function buildLivePalette(primaryHex: string, accentHex: string): LiveOrbPalette {
  const primary = parseHexToRgb(primaryHex, DEFAULT_PRIMARY);
  const accent = parseHexToRgb(accentHex, DEFAULT_ACCENT);
  const hot = mixRgb(accent, { r: 255, g: 245, b: 255 }, 0.72);
  const deep = mixRgb(primary, { r: 4, g: 2, b: 14 }, 0.88);
  return { primary, accent, hot, deep };
}

export function lerpPalette(current: LiveOrbPalette, target: LiveOrbPalette, factor: number): void {
  const keys: Array<keyof LiveOrbPalette> = ['primary', 'accent', 'hot', 'deep'];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    current[k].r += (target[k].r - current[k].r) * factor;
    current[k].g += (target[k].g - current[k].g) * factor;
    current[k].b += (target[k].b - current[k].b) * factor;
  }
}

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function easeOutCubic(t: number): number {
  const k = 1 - clamp01(t);
  return 1 - k * k * k;
}

function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutQuad(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) * (1 - x);
}

export interface OrbSlot {
  x: number;
  y: number;
  radius: number;
  cardWidth: number;
  cardHeight: number;
  cornerRadius: number;
  labelSide: 'left' | 'right';
}

/**
 * Computes spacious, non-overlapping Rank-ordered (#1..#8) Image Card coordinates
 * across both mobile portrait (2x4) and desktop/tablet landscape (4x2) viewports,
 * leaving generous breathing space around every card for coiling border light ribbons
 * and the underlying Radar Scan background.
 */
export function computeRankOrbSlots(
  count: number,
  width: number,
  height: number
): OrbSlot[] {
  const slots: OrbSlot[] = [];
  const isPortrait = height > width * 1.05;

  if (isPortrait) {
    const cols = 2;
    const rows = Math.max(1, Math.ceil(count / cols));
    const padX = Math.max(12, Math.min(24, width * 0.038));
    const padY = Math.max(14, Math.min(28, height * 0.028));
    const gapX = Math.max(14, Math.min(24, width * 0.042));
    const gapY = Math.max(14, Math.min(22, height * 0.022));

    const availW = Math.max(140, width - padX * 2 - gapX * (cols - 1));
    const availH = Math.max(240, height - padY * 2 - gapY * (rows - 1));
    const cellW = availW / cols;
    const cellH = availH / rows;

    const baseCardW = Math.max(124, Math.min(220, cellW * 0.94));
    const baseCardH = Math.max(134, Math.min(246, cellH * 0.92, baseCardW * 1.24));
    const gridW = cols * cellW + (cols - 1) * gapX;
    const gridH = rows * cellH + (rows - 1) * gapY;
    const startX = (width - gridW) * 0.5;
    const startY = (height - gridH) * 0.5;

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rankBoost = i === 0 ? 1.03 : 1;
      const cardW = Math.min(cellW * 0.97, baseCardW * rankBoost);
      const cardH = Math.min(cellH * 0.96, baseCardH * rankBoost);
      const x = startX + col * (cellW + gapX) + cellW * 0.5;
      const y = startY + row * (cellH + gapY) + cellH * 0.5;

      slots.push({
        x,
        y,
        radius: Math.min(cardW, cardH) * 0.46,
        cardWidth: cardW,
        cardHeight: cardH,
        cornerRadius: Math.round(Math.max(12, Math.min(18, cardW * 0.095))),
        labelSide: col === 0 ? 'right' : 'left',
      });
    }
    return slots;
  }

  // Landscape / Tablet / Desktop: spacious 4x2 Rank-ordered constellation with subtle floating rhythm
  const cols = 4;
  const rows = Math.max(1, Math.ceil(count / cols));
  const maxGridW = Math.min(width * 0.92, 1280);
  const maxGridH = Math.min(height * 0.86, 760);
  const gapX = Math.max(20, Math.min(38, width * 0.028));
  const gapY = Math.max(22, Math.min(42, height * 0.042));

  const cellW = (maxGridW - gapX * (cols - 1)) / cols;
  const cellH = (maxGridH - gapY * (rows - 1)) / rows;

  const baseCardW = Math.max(150, Math.min(256, cellW * 0.9));
  const baseCardH = Math.max(185, Math.min(314, cellH * 0.88, baseCardW * 1.28));
  const startX = (width - maxGridW) * 0.5;
  const startY = (height - maxGridH) * 0.5;
  const colVerticalStagger = [-0.014, 0.014, -0.01, 0.016];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rankBoost = i === 0 ? 1.045 : i === 1 ? 1.015 : 1;
    const cardW = Math.min(cellW * 0.96, baseCardW * rankBoost);
    const cardH = Math.min(cellH * 0.95, baseCardH * rankBoost);
    const x = startX + col * (cellW + gapX) + cellW * 0.5;
    const staggerY = colVerticalStagger[col % colVerticalStagger.length] * height;
    const y = startY + row * (cellH + gapY) + cellH * 0.5 + staggerY;

    slots.push({
      x,
      y,
      radius: Math.min(cardW, cardH) * 0.45,
      cardWidth: cardW,
      cardHeight: cardH,
      cornerRadius: Math.round(Math.max(14, Math.min(20, cardW * 0.088))),
      labelSide: col < 2 ? 'right' : 'left',
    });
  }
  return slots;
}

function seededUnit(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function createPlasmaRings(rankIndex: number): PlasmaRingSpec[] {
  const rings: PlasmaRingSpec[] = [];
  const count = 7;
  for (let k = 0; k < count; k++) {
    const s = rankIndex * 31 + k * 7.3 + 1;
    rings.push({
      offsetDist: 0.05 + seededUnit(s + 1) * 0.13,
      offsetAngle: (k / count) * Math.PI * 2 + seededUnit(s + 2) * 0.6,
      precessSpeed: (k % 2 === 0 ? 1 : -1) * (0.28 + seededUnit(s + 3) * 0.42),
      tilt: (k / count) * Math.PI + seededUnit(s + 4) * 0.4,
      spinSpeed: (k % 2 === 0 ? 1 : -1) * (0.22 + seededUnit(s + 5) * 0.36),
      rxScale: 0.92 + seededUnit(s + 6) * 0.24,
      ryScale: 0.86 + seededUnit(s + 7) * 0.22,
      waveFreq: 2 + (k % 3),
      waveAmp: 0.032 + seededUnit(s + 8) * 0.045,
      waveSpeed: (k % 2 === 0 ? 1 : -1) * (0.9 + seededUnit(s + 9) * 1.15),
      useAccent: k % 2 === 1,
      alphaBoost: 0.72 + seededUnit(s + 10) * 0.45,
    });
  }
  return rings;
}

function createOrbitSparks(rankIndex: number): OrbitSpark[] {
  const sparks: OrbitSpark[] = [];
  const count = 14;
  for (let j = 0; j < count; j++) {
    const s = rankIndex * 53 + j * 11.7;
    sparks.push({
      angle: (j / count) * Math.PI * 2 + seededUnit(s) * 0.5,
      distFactor: 1.04 + seededUnit(s + 1) * 0.48,
      speed: (j % 2 === 0 ? 1 : -1) * (0.16 + seededUnit(s + 2) * 0.32),
      size: 0.85 + seededUnit(s + 3) * 1.45,
      phase: seededUnit(s + 4) * Math.PI * 2,
    });
  }
  return sparks;
}

/**
 * Computes the live draining Main Core radius (px) so river mouths stay visually
 * anchored to the exact perimeter of the 3D Main Core as it drains into the Orbs.
 */
function evalLiveDrainingCoreRadius(
  coreRadiusPx: number,
  elapsed: number,
  reducedMotion: boolean
): number {
  const dur = reducedMotion ? 0.55 : 1.12;
  const t = clamp01(elapsed / dur);
  return Math.max(5, coreRadiusPx * (1 - 0.78 * t * t));
}

/**
 * Evaluates a point along a smooth, natural hydraulic light-river flowing tangentially
 * off the spinning Main Core's live rim (cx, cy, liveCoreR) and curving seamlessly into
 * the Orb's tangential entry point so the river wraps into the Orb with zero corner/kink.
 */
function sampleCoreRiverPoint(
  cx: number,
  cy: number,
  orb: FloatingRadarOrb,
  u: number,
  strandIdx: number,
  elapsed: number,
  coreRadiusPx: number,
  spinDir: number,
  reducedMotion: boolean,
  out: { x: number; y: number }
): void {
  const dx = orb.x - cx;
  const dy = orb.y - cy;
  const destDist = Math.hypot(dx, dy) || 1;
  const destAngle = Math.atan2(dy, dx);

  // Target point on the Orb's outer tangential circumference where the river naturally wraps in
  const entryR = orb.baseRadius * 1.34;
  const tangentOffsetAngle = destAngle + Math.PI * 0.54 * spinDir;
  const targetX = orb.x + Math.cos(tangentOffsetAngle) * entryR;
  const targetY = orb.y + Math.sin(tangentOffsetAngle) * entryR;

  const tdx = targetX - cx;
  const tdy = targetY - cy;
  const totalDist = Math.hypot(tdx, tdy) || 1;
  const targetAngle = Math.atan2(tdy, tdx);

  const liveCoreR = Math.min(
    evalLiveDrainingCoreRadius(coreRadiusPx, elapsed, reducedMotion),
    totalDist * 0.42
  );

  // Smooth laminar radial progression from spinning Core perimeter -> Orb tangent
  const rProgress = easeOutQuad(u);
  const radius = liveCoreR + (totalDist - liveCoreR) * rProgress;

  // Natural flowing river spiral unwinding tangentially in the Main Core's spin direction
  // plus gentle downstream fluid meander wave
  const swirlDecay = Math.pow(1 - u, 1.48);
  const coreSpinAdvect = Math.min(elapsed, 1.2) * 0.52 * spinDir * (1 - u);
  const twistAngle = -spinDir * orb.spiralTwistTurns * Math.PI * 0.88 * swirlDecay + coreSpinAdvect;
  const riverMeander =
    Math.sin(u * Math.PI * 1.65 - elapsed * 3.2 + orb.p2) *
    0.14 *
    Math.sin(clamp01(u) * Math.PI);
  const angle = targetAngle + twistAngle + riverMeander;

  const baseX = cx + Math.cos(angle) * radius;
  const baseY = cy + Math.sin(angle) * radius;

  // Braided laminar sub-currents flowing downstream inside the liquid river body
  const env = Math.sin(clamp01(u) * Math.PI);
  const braidAmp = (5.5 + orb.baseRadius * 0.22) * env;
  const strandPhase = strandIdx * ((Math.PI * 2) / 3) + orb.p3;
  const braidOffset =
    strandIdx < 0
      ? 0
      : Math.sin(u * 9.5 - elapsed * 11.2 + strandPhase) * braidAmp;

  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  out.x = baseX + nx * braidOffset;
  out.y = baseY + ny * braidOffset;
}

/**
 * Spawns all Rank-ordered space-droplet orbs anchored at their Radar destination slots,
 * ready to be physically woven & coiled into existence by the Main Core's liquid light rivers.
 */
export function createFloatingRadarOrbs(
  rankedProducts: ReadonlyArray<OrbitalResearchProduct>,
  width: number,
  height: number
): FloatingRadarOrb[] {
  const slots = computeRankOrbSlots(rankedProducts.length, width, height);

  return rankedProducts.map((product, idx) => {
    const slot = slots[idx];
    const seed = (idx + 1) * 19.37;

    return {
      id: product.id,
      rank: idx + 1,
      product,
      homeX: slot.x,
      homeY: slot.y,
      x: slot.x,
      y: slot.y,
      vx: 0,
      vy: 0,
      baseRadius: slot.radius,
      currentRadius: slot.radius,
      cardWidth: slot.cardWidth,
      cardHeight: slot.cardHeight,
      cornerRadius: slot.cornerRadius,
      currentScale: 1,
      // Locked 1:1 to DigitalCoreEngine's 3D Main Core expanding ribbon morph timings
      launchDelay: 0.08 + idx * 0.036,
      travelDur: 0.86 + (idx % 3) * 0.036,
      coilDur: (0.86 + (idx % 3) * 0.036) * 0.54,
      coilProgress: 0,
      coilLocked: false,
      coilAngleAccum: 0,
      spiralTwistTurns: 1.05 + (idx % 3) * 0.18,
      // Organic micro-wave frequencies for living coiling card borders
      w2: 1.25 + seededUnit(seed + 2) * 0.55,
      w3: 1.72 + seededUnit(seed + 3) * 0.75,
      w4: 2.25 + seededUnit(seed + 4) * 0.9,
      p2: seededUnit(seed + 5) * Math.PI * 2,
      p3: seededUnit(seed + 6) * Math.PI * 2,
      p4: seededUnit(seed + 7) * Math.PI * 2,
      // Gentle zero-G holographic floating drift (keeps Ranked Cards crisp & non-overlapping)
      driftAx: Math.min(7, Math.max(3, width * 0.0045)) * (0.7 + seededUnit(seed + 8) * 0.5),
      driftAy: Math.min(8, Math.max(3.5, height * 0.006)) * (0.7 + seededUnit(seed + 9) * 0.5),
      driftWx: 0.36 + seededUnit(seed + 10) * 0.24,
      driftWy: 0.31 + seededUnit(seed + 11) * 0.24,
      driftPx: seededUnit(seed + 12) * Math.PI * 2,
      driftPy: seededUnit(seed + 13) * Math.PI * 2,
      wobbleEnergy: 0,
      pingEnergy: 0,
      labelSide: slot.labelSide,
      labelX: slot.x,
      labelY: slot.y,
      labelOpacity: 0,
      rings: createPlasmaRings(idx),
      sparks: createOrbitSparks(idx),
    };
  });
}

/**
 * Updates Ranked Image Card home slots seamlessly on viewport resize without replaying the morph.
 */
export function updateOrbSlotsForResize(
  orbs: FloatingRadarOrb[],
  width: number,
  height: number
): void {
  const slots = computeRankOrbSlots(orbs.length, width, height);
  for (let i = 0; i < orbs.length; i++) {
    const slot = slots[i];
    orbs[i].homeX = slot.x;
    orbs[i].homeY = slot.y;
    orbs[i].baseRadius = slot.radius;
    orbs[i].cardWidth = slot.cardWidth;
    orbs[i].cardHeight = slot.cardHeight;
    orbs[i].cornerRadius = slot.cornerRadius;
    orbs[i].labelSide = slot.labelSide;
  }
}

/**
 * Generates luminous spark particles that shed tangentially off the unwinding Core
 * spiral light streams and decelerate gently into floating cosmic stardust.
 */
export function createExplosionParticles(
  width: number,
  height: number,
  orbCount = 8
): ScatterParticle[] {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const count = width < 640 ? 120 : 170;
  const particles: ScatterParticle[] = [];

  for (let i = 0; i < count; i++) {
    const orbIdx = i % Math.max(1, orbCount);
    const spawnU = 0.08 + Math.random() * 0.9;
    const birthTime = 0.1 + orbIdx * 0.036 + spawnU * (0.86 + (orbIdx % 3) * 0.036) * 0.74;
    particles.push({
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      driftAngle: Math.random() * Math.PI * 2,
      driftSpeed: 4 + Math.random() * 10,
      size: 0.85 + Math.random() * 1.9,
      alpha: 0.35 + Math.random() * 0.65,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 1.4 + Math.random() * 2.5,
      useAccent: Math.random() > 0.42,
      birthTime,
      born: false,
      settled: 0,
      streamOrbIndex: orbIdx,
      spawnU,
    });
  }

  return particles;
}

/**
 * Evaluates the live capillary liquid-droplet radial multiplier at angle theta.
 */
function evalDropletRadiusScale(
  theta: number,
  time: number,
  orb: FloatingRadarOrb,
  reducedMotion: boolean
): number {
  const motionScale = reducedMotion ? 0.3 : 1;
  const amp = (1 + orb.wobbleEnergy * 2.15) * motionScale;
  const m2 = Math.sin(2 * theta + time * orb.w2 + orb.p2) * 0.044 * amp;
  const m3 = Math.cos(3 * theta - time * orb.w3 + orb.p3) * 0.028 * amp;
  const m4 = Math.sin(4 * theta + time * orb.w4 + orb.p4) * 0.015 * amp;

  const speed = Math.hypot(orb.vx, orb.vy);
  let stretch = 0;
  if (speed > 18 && !reducedMotion) {
    const moveAngle = Math.atan2(orb.vy, orb.vx);
    stretch = Math.min(0.12, speed * 0.00024) * Math.cos(2 * (theta - moveAngle));
  }
  return 1 + m2 + m3 + m4 + stretch;
}

export interface StepPhysicsOptions {
  orbs: FloatingRadarOrb[];
  particles: ScatterParticle[];
  ripples: RadarEchoRipple[];
  dt: number;
  elapsed: number;
  width: number;
  height: number;
  prevSweepAngle: number;
  nextSweepAngle: number;
  radarSweepActive: boolean;
  coreRadiusPx: number;
  spinVelocity: number;
  draggedOrbId: string | null;
  focusedOrbId: string | null;
  reducedMotion: boolean;
}

function angleInClockwiseSweep(angle: number, start: number, end: number): boolean {
  const twoPi = Math.PI * 2;
  const normA = ((angle % twoPi) + twoPi) % twoPi;
  const normS = ((start % twoPi) + twoPi) % twoPi;
  const normE = ((end % twoPi) + twoPi) % twoPi;
  if (normS <= normE) {
    return normA >= normS && normA < normE;
  }
  return normA >= normS || normA < normE;
}

export function stepRadarWorldPhysics(opts: StepPhysicsOptions): void {
  const {
    orbs,
    particles,
    ripples,
    dt,
    elapsed,
    width,
    height,
    prevSweepAngle,
    nextSweepAngle,
    radarSweepActive,
    coreRadiusPx,
    spinVelocity,
    draggedOrbId,
    focusedOrbId,
    reducedMotion,
  } = opts;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const isPortrait = height > width * 1.12;
  const spinDir = spinVelocity < -0.25 ? -1 : 1;
  const tmpPt = { x: cx, y: cy };
  const tmpPt2 = { x: cx, y: cy };

  // 1. Shed luminous droplet mist particles tangentially off the flowing liquid-light rivers
  const dragExp = Math.exp(-2.35 * dt);
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p.born) {
      if (elapsed >= p.birthTime && orbs.length > 0) {
        const orb = orbs[p.streamOrbIndex % orbs.length];
        const u = p.spawnU;
        sampleCoreRiverPoint(cx, cy, orb, u, i % 3, elapsed, coreRadiusPx, spinDir, reducedMotion, tmpPt);
        sampleCoreRiverPoint(
          cx,
          cy,
          orb,
          Math.min(1, u + 0.03),
          i % 3,
          elapsed,
          coreRadiusPx,
          spinDir,
          reducedMotion,
          tmpPt2
        );
        const tx = tmpPt2.x - tmpPt.x;
        const ty = tmpPt2.y - tmpPt.y;
        const tLen = Math.hypot(tx, ty) || 1;
        const speed = 38 + Math.random() * 115;
        const spread = (Math.random() - 0.5) * 1.1;
        const baseAngle = Math.atan2(ty / tLen, tx / tLen) + spread;
        p.x = tmpPt.x + (Math.random() - 0.5) * 7;
        p.y = tmpPt.y + (Math.random() - 0.5) * 7;
        p.vx = Math.cos(baseAngle) * speed;
        p.vy = Math.sin(baseAngle) * speed;
        p.born = true;
      } else {
        continue;
      }
    }

    p.settled = Math.min(1, p.settled + dt * 0.95);
    p.vx *= dragExp;
    p.vy *= dragExp;

    p.driftAngle += Math.sin(elapsed * 0.45 + p.twinklePhase) * 0.35 * dt;
    const ambientVx =
      Math.cos(p.driftAngle) * p.driftSpeed * p.settled * (reducedMotion ? 0.25 : 1);
    const ambientVy =
      Math.sin(p.driftAngle) * p.driftSpeed * p.settled * (reducedMotion ? 0.25 : 1);

    p.x += (p.vx + ambientVx) * dt;
    p.y += (p.vy + ambientVy) * dt;

    if (p.settled > 0.65) {
      if (p.x < -12) p.x = width + 12;
      else if (p.x > width + 12) p.x = -12;
      if (p.y < -12) p.y = height + 12;
      else if (p.y > height + 12) p.y = -12;
    }
  }

  // 2. Update radar echo ripples
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.radius += (r.maxRadius - r.radius) * Math.min(1, dt * 3.1) + 28 * dt;
    r.alpha -= dt * 0.85;
    if (r.alpha <= 0.01 || r.radius >= r.maxRadius) {
      ripples.splice(i, 1);
    }
  }

  // 3. Update Core-to-Orb coiling progress & zero-gravity floating space-droplet physics
  for (let i = 0; i < orbs.length; i++) {
    const orb = orbs[i];
    const isDragged = orb.id === draggedOrbId;
    const isFocused = orb.id === focusedOrbId;

    const orbIdx = orb.rank - 1;
    const effDelay = reducedMotion ? 0.04 + orbIdx * 0.018 : orb.launchDelay;
    const effDur = reducedMotion ? 0.44 + (orbIdx % 3) * 0.02 : orb.travelDur;
    const localT = Math.max(0, elapsed - effDelay);
    // Begin condensing the 2D interactive Space-Droplet Orb right as its 3D Main Core ribbons arrive & wrap closed
    const rawCoil = clamp01((localT - effDur * 0.58) / (effDur * 0.54));
    orb.coilProgress = easeOutCubic(rawCoil);

    // Extra fast rotational swirl while liquid light river is actively coiling into the Orb
    const coilSpinRate = Math.pow(1 - orb.coilProgress, 1.7) * (reducedMotion ? 1.5 : 8.8) * spinDir;
    orb.coilAngleAccum += coilSpinRate * dt;

    // Trigger liquid droplet settling rebound once coiled shut!
    if (!orb.coilLocked && orb.coilProgress >= 0.86) {
      orb.coilLocked = true;
      orb.wobbleEnergy = Math.max(orb.wobbleEnergy, 1.4);
      orb.pingEnergy = Math.max(orb.pingEnergy, 0.88);
      ripples.push({
        x: orb.x,
        y: orb.y,
        radius: orb.baseRadius * 0.96,
        maxRadius: orb.baseRadius * 2.4,
        alpha: 0.65,
        useAccent: orb.rank % 2 === 1,
      });
    }

    // Subtle z-depth breathing scale & smooth focus zoom (synchronized 1:1 with DOM card & coiling border lights)
    const zBreath = reducedMotion ? 1 : 1 + Math.sin(elapsed * 0.88 + orb.p2) * 0.012;
    const focusBoost = isFocused ? (isPortrait ? 1.07 : 1.11) : 1;
    const pingBoost = 1 + orb.pingEnergy * 0.026;
    const coilSettle = 0.88 + 0.12 * smoothstep(0.05, 1.0, orb.coilProgress);
    const targetScale = coilSettle * zBreath * focusBoost * pingBoost;
    orb.currentScale += (targetScale - orb.currentScale) * Math.min(1, dt * 11);

    const targetR = orb.baseRadius * orb.currentScale;
    orb.currentRadius += (targetR - orb.currentRadius) * Math.min(1, dt * 11);

    // Decay liquid border wobble & radar ping energy smoothly
    orb.wobbleEnergy *= Math.exp(-2.1 * dt);
    if (orb.wobbleEnergy < 0.002) orb.wobbleEnergy = 0;
    orb.pingEnergy *= Math.exp(-1.55 * dt);
    if (orb.pingEnergy < 0.002) orb.pingEnergy = 0;

    if (!isDragged) {
      // Gentle zero-G buoyant hover around each Ranked Image Card's home slot
      const driftScale = (reducedMotion ? 0.15 : 1) * smoothstep(0.4, 1, orb.coilProgress) * (isFocused ? 0.2 : 1);
      const targetX =
        orb.homeX + Math.sin(elapsed * orb.driftWx + orb.driftPx) * orb.driftAx * driftScale;
      const targetY =
        orb.homeY + Math.cos(elapsed * orb.driftWy + orb.driftPy) * orb.driftAy * driftScale;

      const stiffness = 6.2;
      const damping = 4.6;
      const ax = (targetX - orb.x) * stiffness - orb.vx * damping;
      const ay = (targetY - orb.y) * stiffness - orb.vy * damping;

      orb.vx += ax * dt;
      orb.vy += ay * dt;
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
    }

    // Check if rotating radar sweep beam just crossed this coiled Card (ONLY after Radar sweep deploys!)
    if (radarSweepActive && orb.coilProgress > 0.82) {
      const orbAngle = Math.atan2(orb.y - cy, orb.x - cx);
      if (angleInClockwiseSweep(orbAngle, prevSweepAngle, nextSweepAngle)) {
        orb.pingEnergy = 1;
        orb.wobbleEnergy = Math.min(1.5, orb.wobbleEnergy + 0.36);
        ripples.push({
          x: orb.x,
          y: orb.y,
          radius: Math.max(orb.cardWidth, orb.cardHeight) * 0.44,
          maxRadius: Math.max(orb.cardWidth, orb.cardHeight) * 1.15,
          alpha: 0.62,
          useAccent: orb.rank % 2 === 1,
        });
      }
    }

    // Smooth card body reveal synchronized with its coiling light border
    orb.labelOpacity = smoothstep(0.18, 0.92, orb.coilProgress);
  }

  // 4. Soft viewport edge cushion so dragged/enlarged Ranked Image Cards stay cleanly on screen
  for (let i = 0; i < orbs.length; i++) {
    const orb = orbs[i];
    const halfW = orb.cardWidth * orb.currentScale * 0.5 + 8;
    const halfH = orb.cardHeight * orb.currentScale * 0.5 + 8;

    if (orb.x < halfW) {
      orb.x = halfW;
      orb.vx = Math.abs(orb.vx) * 0.35;
    } else if (orb.x > width - halfW) {
      orb.x = width - halfW;
      orb.vx = -Math.abs(orb.vx) * 0.35;
    }
    if (orb.y < halfH) {
      orb.y = halfH;
      orb.vy = Math.abs(orb.vy) * 0.35;
    } else if (orb.y > height - halfH) {
      orb.y = height - halfH;
      orb.vy = -Math.abs(orb.vy) * 0.35;
    }

    orb.labelX = orb.x;
    orb.labelY = orb.y;
  }
}

/**
 * Renders the 100% transparent Single-Screen Radar Scan Background.
 * - During Phase 1 (Core -> Liquid Rivers -> Orbs): stays completely clear so the
 *   WebGL space canvas & draining Main Core exist in ONE continuous uninterrupted space.
 * - Phase 2 (after Orbs finish coiling): systematically deploys from exact center (cx, cy) outward:
 *   1) Center origin reticle + expanding awakening wave pulse
 *   2) Cardinal & diagonal radial axes growing smoothly outward from 0 -> maxR
 *   3) 6 concentric range rings expanding systematically one-by-one from center
 *   4) 72 compass degree ticks fanning symmetrically from top around 360°
 *   5) 360° rotating Radar sweep beam extending radially & igniting sonar scans
 */
export function drawRadarBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sweepAngle: number,
  elapsed: number,
  palette: LiveOrbPalette,
  ripples: ReadonlyArray<RadarEchoRipple>,
  reducedMotion = false
): void {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxR = Math.hypot(width, height) * 0.56;

  // Transparent clear so the single-screen WebGL cosmic backdrop stays unified with zero cut!
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, width, height);

  // Always render any active orb-lock / sonar ripples
  if (ripples.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ripples.length; i++) {
      const r = ripples[i];
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.strokeStyle = rgbaStr(r.useAccent ? palette.accent : palette.primary, r.alpha * 0.65);
      ctx.lineWidth = 1.35;
      ctx.stroke();
    }
    ctx.restore();
  }

  const timings = getRadarDeployTimings(reducedMotion);
  const rt = elapsed - timings.radarStart;
  if (rt <= 0) return;

  // Stage 1: Expanding translucent atmospheric field & central ignition pulse wave
  const fieldExpand = easeOutCubic(clamp01(rt / 1.15));
  const fieldR = Math.max(12, maxR * 1.12 * fieldExpand);
  const fieldAlpha = smoothstep(0.0, 0.85, rt) * 0.34;
  if (fieldAlpha > 0.002) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const atmGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, fieldR);
    atmGrad.addColorStop(0, rgbaStr(palette.primary, 0.22 * fieldAlpha));
    atmGrad.addColorStop(0.55, rgbaStr(palette.primary, 0.08 * fieldAlpha));
    atmGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = atmGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, fieldR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Expanding luminous awakening shockwave ring sweeping out from center as Radar activates
  if (rt < 0.95) {
    const waveT = clamp01(rt / 0.92);
    const waveR = Math.max(4, easeOutCubic(waveT) * maxR * 0.98);
    const waveAlpha = (1 - smoothstep(0.18, 1.0, waveT)) * 0.52;
    if (waveAlpha > 0.004) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.arc(cx, cy, waveR, 0, Math.PI * 2);
      ctx.strokeStyle = rgbaStr(palette.accent, waveAlpha);
      ctx.lineWidth = 2.0;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, waveR, 0, Math.PI * 2);
      ctx.strokeStyle = rgbaStr(palette.primary, waveAlpha * 0.35);
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.save();

  // Stage 2: Radial crosshair axes growing smoothly outward from exact center (0 -> maxR)
  const cardinalReach = easeOutCubic(clamp01((rt - 0.05) / 0.62));
  const diagReach = easeOutCubic(clamp01((rt - 0.16) / 0.64));
  const axisAngles = [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75];
  for (let i = 0; i < axisAngles.length; i++) {
    const isCardinal = i % 2 === 0;
    const reach = isCardinal ? cardinalReach : diagReach;
    if (reach <= 0.005) continue;

    const a = axisAngles[i];
    const rLen = maxR * reach;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(cx - cosA * rLen, cy - sinA * rLen);
    ctx.lineTo(cx + cosA * rLen, cy + sinA * rLen);
    ctx.strokeStyle = rgbaStr(palette.primary, (isCardinal ? 0.14 : 0.075) * Math.min(1, reach * 1.4));
    ctx.lineWidth = isCardinal ? 0.95 : 0.65;
    ctx.stroke();

    // Subtle luminous growing tip glints while spokes are extending outward
    if (reach < 0.98) {
      const tipFade = Math.sin(reach * Math.PI);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgbaStr(palette.hot, 0.55 * tipFade);
      ctx.beginPath();
      ctx.arc(cx + cosA * rLen, cy + sinA * rLen, 1.8, 0, Math.PI * 2);
      ctx.arc(cx - cosA * rLen, cy - sinA * rLen, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Stage 3: Concentric radar range rings expanding systematically one-by-one from center (r = 0 -> calibrated R)
  const ringCount = 6;
  const baseRingStep = maxR / ringCount;
  for (let i = 1; i <= ringCount; i++) {
    const ringDelay = 0.12 + (i - 1) * 0.11;
    const ringT = clamp01((rt - ringDelay) / 0.48);
    if (ringT <= 0.002) continue;

    const ringExpand = easeOutCubic(ringT);
    const r = baseRingStep * i * ringExpand;
    const isMajor = i % 2 === 0;
    const lockFlare = Math.sin(ringT * Math.PI) * 0.22;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = rgbaStr(
      isMajor ? palette.accent : palette.primary,
      (isMajor ? 0.17 : 0.11) * Math.min(1, ringT * 1.6) + lockFlare
    );
    ctx.lineWidth = isMajor ? 1.08 : 0.75;
    if (!isMajor) {
      ctx.setLineDash([4, 8]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Stage 4: Precision compass degree ticks expanding & sweeping symmetrically around 360°
  const tickDeploy = clamp01((rt - 0.54) / 0.66);
  if (tickDeploy > 0.01) {
    const tickRingR = Math.min(width, height) * 0.44 * (0.45 + 0.55 * easeOutCubic(tickDeploy));
    const sweepReveal = easeInOutCubic(tickDeploy);
    const tickCount = 72;
    for (let t = 0; t < tickCount; t++) {
      // Symmetrical fan starting from 12 o'clock (-PI/2) down both sides
      const fracFromTop = Math.min(t, tickCount - t) / (tickCount * 0.5);
      if (fracFromTop > sweepReveal) continue;
      const tickAlphaScale = clamp01((sweepReveal - fracFromTop) * 8);

      const a = -Math.PI * 0.5 + (t / tickCount) * Math.PI * 2;
      const isMajor = t % 6 === 0;
      const inner = tickRingR - (isMajor ? 6.5 : 3);
      const outer = tickRingR + (isMajor ? 2 : 0.5);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.strokeStyle = rgbaStr(
        isMajor ? palette.accent : palette.primary,
        (isMajor ? 0.28 : 0.12) * tickAlphaScale
      );
      ctx.lineWidth = isMajor ? 1.1 : 0.7;
      ctx.stroke();
    }
  }

  // Center radar origin reticle blooming crisply at (cx, cy)
  const reticleT = easeOutCubic(clamp01(rt / 0.36));
  if (reticleT > 0.01) {
    ctx.beginPath();
    ctx.arc(cx, cy, 4.2 * reticleT, 0, Math.PI * 2);
    ctx.strokeStyle = rgbaStr(palette.accent, 0.36 * reticleT);
    ctx.lineWidth = 1.05;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 1.4 * reticleT, 0, Math.PI * 2);
    ctx.fillStyle = rgbaStr(palette.hot, 0.52 * reticleT);
    ctx.fill();
  }

  // Stage 5: Continuous 360° Rotating Radar Sweep Beam extends radially & ignites after grid settles
  const beamT = clamp01((elapsed - timings.sweepStart) / 0.56);
  if (beamT > 0.005) {
    const beamExtend = easeOutCubic(beamT);
    const beamR = maxR * beamExtend;
    const beamAlpha = smoothstep(0.0, 0.72, beamT);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sweepArc = 1.02 * beamExtend;
    const sliceCount = 26;
    const sliceStep = sweepArc / sliceCount;

    for (let s = 0; s < sliceCount; s++) {
      const frac = s / sliceCount;
      const a0 = sweepAngle - sweepArc + s * sliceStep;
      const a1 = a0 + sliceStep + 0.008;
      const sliceAlpha = Math.pow(frac, 2.35) * 0.16 * beamAlpha;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, beamR, a0, a1);
      ctx.closePath();
      ctx.fillStyle = rgbaStr(frac > 0.72 ? palette.accent : palette.primary, sliceAlpha);
      ctx.fill();
    }

    const leadX = cx + Math.cos(sweepAngle) * beamR;
    const leadY = cy + Math.sin(sweepAngle) * beamR;
    const lineGrad = ctx.createLinearGradient(cx, cy, leadX, leadY);
    lineGrad.addColorStop(0, rgbaStr(palette.accent, 0.08 * beamAlpha));
    lineGrad.addColorStop(0.28, rgbaStr(palette.accent, 0.56 * beamAlpha));
    lineGrad.addColorStop(0.85, rgbaStr(palette.hot, 0.44 * beamAlpha));
    lineGrad.addColorStop(1, rgbaStr(palette.primary, 0.06 * beamAlpha));

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(leadX, leadY);
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(leadX, leadY);
    ctx.strokeStyle = rgbaStr(palette.primary, 0.16 * beamAlpha);
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Renders natural flowing Liquid-Light Rivers pouring tangentially off the spinning
 * 3D Main Core's live rim, meandering like luminous water currents across the single screen,
 * and wrapping tangentially around each Orb to weave its 7 space-droplet plasma rings!
 */
export function drawCoreToOrbLightStreams(
  ctx: CanvasRenderingContext2D,
  orbs: ReadonlyArray<FloatingRadarOrb>,
  width: number,
  height: number,
  elapsed: number,
  palette: LiveOrbPalette,
  coreRadiusPx: number,
  spinVelocity: number,
  reducedMotion = false
): void {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const spinDir = spinVelocity < -0.25 ? -1 : 1;
  const pt = { x: cx, y: cy };

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 0. Live Draining Meniscus Halo welded right onto the 3D Main Core's shrinking rim
  const drainDur = reducedMotion ? 0.55 : 1.12;
  if (elapsed < drainDur + 0.18) {
    const drainT = clamp01(elapsed / drainDur);
    const liveCoreR = evalLiveDrainingCoreRadius(coreRadiusPx, elapsed, reducedMotion);
    const rimFade = (1 - smoothstep(0.28, 1.0, drainT)) * 0.65;
    if (rimFade > 0.01) {
      const mGrad = ctx.createRadialGradient(cx, cy, liveCoreR * 0.45, cx, cy, liveCoreR * 1.65);
      mGrad.addColorStop(0, rgbaStr(palette.hot, 0.34 * rimFade));
      mGrad.addColorStop(0.52, rgbaStr(palette.accent, 0.42 * rimFade));
      mGrad.addColorStop(0.82, rgbaStr(palette.primary, 0.16 * rimFade));
      mGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, liveCoreR * 1.65, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (let i = 0; i < orbs.length; i++) {
    const orb = orbs[i];
    const localT = elapsed - orb.launchDelay;
    if (localT <= 0) continue;

    const headRaw = clamp01(localT / orb.travelDur);
    const tailRaw = clamp01((localT - 0.18) / (orb.travelDur + orb.coilDur * 0.64));
    if (tailRaw >= 0.996) continue;

    const headU = easeOutCubic(headRaw);
    const tailU = easeInOutCubic(tailRaw);
    const spanU = headU - tailU;
    if (spanU <= 0.004 && headRaw < 0.98) continue;

    // Overall river luminescence fades naturally as the final tail reels into the coiled Orb
    const reelFade = 1 - smoothstep(0.7, 1.0, tailRaw);
    const destAngle = Math.atan2(orb.y - cy, orb.x - cx);
    const tangentStartAngle = destAngle + Math.PI * 0.54 * spinDir;

    // PASS 1: Filled Tapered Liquid-Light River Body (variable-width glowing fluid stream!)
    const spineSamples = 26;
    const spineX: number[] = [];
    const spineY: number[] = [];
    if (spanU > 0.004) {
      for (let s = 0; s <= spineSamples; s++) {
        const frac = s / spineSamples;
        const u = tailU + spanU * frac;
        sampleCoreRiverPoint(cx, cy, orb, u, -1, elapsed, coreRadiusPx, spinDir, reducedMotion, pt);
        spineX.push(pt.x);
        spineY.push(pt.y);
      }
    }

    const wrapStart = smoothstep(0.64, 1.0, headRaw);
    if (wrapStart > 0.01) {
      const wrapSteps = 20;
      const wrapTurns = wrapStart * 1.55 * Math.PI * 2 * spinDir;
      for (let w = 1; w <= wrapSteps; w++) {
        const wf = w / wrapSteps;
        const ang = tangentStartAngle + wf * wrapTurns + orb.coilAngleAccum * 0.25;
        const wrapR = orb.baseRadius * (1.34 - wf * 0.36);
        spineX.push(orb.x + Math.cos(ang) * wrapR);
        spineY.push(orb.y + Math.sin(ang) * wrapR);
      }
    }

    const totalSpine = spineX.length;
    if (totalSpine >= 3) {
      const leftX = new Float32Array(totalSpine);
      const leftY = new Float32Array(totalSpine);
      const rightX = new Float32Array(totalSpine);
      const rightY = new Float32Array(totalSpine);

      const maxHalfW = Math.max(5.5, orb.baseRadius * 0.28) * (0.45 + 0.55 * reelFade);
      for (let k = 0; k < totalSpine; k++) {
        const prevIdx = Math.max(0, k - 1);
        const nextIdx = Math.min(totalSpine - 1, k + 1);
        const tx = spineX[nextIdx] - spineX[prevIdx];
        const ty = spineY[nextIdx] - spineY[prevIdx];
        const len = Math.hypot(tx, ty) || 1;
        const nx = -ty / len;
        const ny = tx / len;

        const frac = k / (totalSpine - 1);
        // Tapered river profile: smooth bell swell with flowing liquid wave undulations
        const taper = Math.pow(Math.sin(frac * Math.PI), 0.62);
        const fluidPulse = 0.76 + 0.24 * Math.sin(frac * 10.0 - elapsed * 10.5 + orb.p2);
        const hw = maxHalfW * taper * fluidPulse;

        leftX[k] = spineX[k] + nx * hw;
        leftY[k] = spineY[k] + ny * hw;
        rightX[k] = spineX[k] - nx * hw;
        rightY[k] = spineY[k] - ny * hw;
      }

      ctx.beginPath();
      ctx.moveTo(leftX[0], leftY[0]);
      for (let k = 1; k < totalSpine; k++) {
        ctx.lineTo(leftX[k], leftY[k]);
      }
      for (let k = totalSpine - 1; k >= 0; k--) {
        ctx.lineTo(rightX[k], rightY[k]);
      }
      ctx.closePath();

      const riverGrad = ctx.createLinearGradient(
        spineX[0],
        spineY[0],
        spineX[totalSpine - 1],
        spineY[totalSpine - 1]
      );
      riverGrad.addColorStop(0, rgbaStr(palette.primary, 0.04 * reelFade));
      riverGrad.addColorStop(0.28, rgbaStr(palette.primary, 0.24 * reelFade));
      riverGrad.addColorStop(0.72, rgbaStr(palette.accent, 0.30 * reelFade));
      riverGrad.addColorStop(1, rgbaStr(palette.hot, 0.14 * reelFade));
      ctx.fillStyle = riverGrad;
      ctx.fill();
    }

    // PASS 2: 3 Braided Laminar Water-Current Filaments flowing downstream & coiling into Orb
    for (let strand = 0; strand < 3; strand++) {
      const isCenterStrand = strand === 1;
      const samples = 28;
      const ptsX: number[] = [];
      const ptsY: number[] = [];

      if (spanU > 0.004) {
        for (let s = 0; s <= samples; s++) {
          const frac = s / samples;
          const u = tailU + spanU * frac;
          sampleCoreRiverPoint(
            cx,
            cy,
            orb,
            u,
            strand,
            elapsed,
            coreRadiusPx,
            spinDir,
            reducedMotion,
            pt
          );
          ptsX.push(pt.x);
          ptsY.push(pt.y);
        }
      }

      if (wrapStart > 0.01) {
        const wrapTurns = wrapStart * (1.35 + strand * 0.24) * Math.PI * 2 * spinDir;
        const wrapSteps = 22;
        const baseStartAngle = tangentStartAngle + (strand - 1) * 0.24;
        for (let w = 1; w <= wrapSteps; w++) {
          const wf = w / wrapSteps;
          const ang = baseStartAngle + wf * wrapTurns + orb.coilAngleAccum * 0.3;
          const wrapR =
            orb.baseRadius *
            (1.36 - wf * 0.38) *
            (0.95 + 0.07 * Math.sin(wf * 6 - elapsed * 6 + strand));
          ptsX.push(orb.x + Math.cos(ang) * wrapR);
          ptsY.push(orb.y + Math.sin(ang) * wrapR);
        }
      }

      if (ptsX.length < 2) continue;

      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let p = 1; p < ptsX.length - 1; p++) {
        const mx = (ptsX[p] + ptsX[p + 1]) * 0.5;
        const my = (ptsY[p] + ptsY[p + 1]) * 0.5;
        ctx.quadraticCurveTo(ptsX[p], ptsY[p], mx, my);
      }
      ctx.lineTo(ptsX[ptsX.length - 1], ptsY[ptsY.length - 1]);

      const streamColor = isCenterStrand ? palette.accent : palette.primary;

      // Soft flowing liquid plasma aura
      ctx.strokeStyle = rgbaStr(streamColor, (isCenterStrand ? 0.36 : 0.24) * reelFade);
      ctx.lineWidth = isCenterStrand ? 6.4 : 4.2;
      ctx.stroke();

      // Razor-crisp shimmering water-light current core
      ctx.strokeStyle = rgbaStr(
        isCenterStrand ? palette.hot : palette.accent,
        (isCenterStrand ? 0.84 : 0.56) * reelFade
      );
      ctx.lineWidth = isCenterStrand ? 1.9 : 1.15;
      ctx.stroke();
    }

    // PASS 3: Luminous micro-droplets actively surging downstream from Main Core -> Orb
    if (spanU > 0.06 && reelFade > 0.05) {
      const dropletCount = 5;
      for (let d = 0; d < dropletCount; d++) {
        const flowPhase = (d / dropletCount + elapsed * 1.45 + orb.p4 * 0.1) % 1;
        const u = tailU + spanU * flowPhase;
        sampleCoreRiverPoint(
          cx,
          cy,
          orb,
          u,
          d % 3,
          elapsed,
          coreRadiusPx,
          spinDir,
          reducedMotion,
          pt
        );
        const beadFade = Math.sin(flowPhase * Math.PI) * reelFade;
        const beadR = 1.6 + (d % 2) * 1.1;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, beadR, 0, Math.PI * 2);
        ctx.fillStyle = rgbaStr(palette.hot, 0.88 * beadFade);
        ctx.fill();
      }
    }

    // PASS 4: Leading luminous fluid crest while the river front sweeps toward the Orb
    if (headRaw < 0.96) {
      sampleCoreRiverPoint(
        cx,
        cy,
        orb,
        headU,
        1,
        elapsed,
        coreRadiusPx,
        spinDir,
        reducedMotion,
        pt
      );
      const flareAlpha = (1 - smoothstep(0.76, 0.96, headRaw)) * 0.92;
      const flareR = 13 + orb.baseRadius * 0.34;
      const fGrad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, flareR);
      fGrad.addColorStop(0, rgbaStr(palette.hot, flareAlpha));
      fGrad.addColorStop(0.36, rgbaStr(palette.accent, flareAlpha * 0.58));
      fGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fGrad;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, flareR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Renders the shimmering light particles shed off the unwinding Core streams
 * transitioning smoothly into weightless drifting cosmic dust.
 */
export function drawScatterParticles(
  ctx: CanvasRenderingContext2D,
  particles: ReadonlyArray<ScatterParticle>,
  elapsed: number,
  palette: LiveOrbPalette
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p.born) continue;

    const twinkle = 0.58 + 0.42 * Math.sin(elapsed * p.twinkleSpeed + p.twinklePhase);
    const col = p.useAccent ? palette.accent : palette.hot;
    const speed = Math.hypot(p.vx, p.vy);

    if (speed > 36 && p.settled < 0.82) {
      const tailScale = Math.min(0.06, 0.02 + speed * 0.00008);
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * tailScale, p.y - p.vy * tailScale);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = rgbaStr(col, p.alpha * 0.68);
      ctx.lineWidth = Math.max(0.9, p.size * 0.85);
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    const dotAlpha = p.alpha * twinkle * (0.42 + (1 - p.settled) * 0.58);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.72 + (1 - p.settled) * 0.42), 0, Math.PI * 2);
    ctx.fillStyle = rgbaStr(col, dotAlpha);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Traces a smooth closed liquid droplet curve using deformed polar vertices.
 */
function traceLiquidDropletPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  baseR: number,
  elapsed: number,
  orb: FloatingRadarOrb,
  reducedMotion: boolean,
  steps = 44
): void {
  const ptsX = new Float32Array(steps);
  const ptsY = new Float32Array(steps);

  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const r = baseR * evalDropletRadiusScale(theta, elapsed, orb, reducedMotion);
    ptsX[i] = cx + Math.cos(theta) * r;
    ptsY[i] = cy + Math.sin(theta) * r;
  }

  ctx.beginPath();
  const lastX = (ptsX[steps - 1] + ptsX[0]) * 0.5;
  const lastY = (ptsY[steps - 1] + ptsY[0]) * 0.5;
  ctx.moveTo(lastX, lastY);
  for (let i = 0; i < steps; i++) {
    const next = (i + 1) % steps;
    const mx = (ptsX[i] + ptsX[next]) * 0.5;
    const my = (ptsY[i] + ptsY[next]) * 0.5;
    ctx.quadraticCurveTo(ptsX[i], ptsY[i], mx, my);
  }
  ctx.closePath();
}

/**
 * Renders one floating zero-gravity space-droplet Energy Orb.
 * During entry (coilProgress 0 -> 1), its 7 plasma rings visibly wind themselves
 * closed with high rotational momentum as the incoming Core light stream coils
 * into a living glowing droplet!
 */
export function drawSpaceDropletOrb(
  ctx: CanvasRenderingContext2D,
  orb: FloatingRadarOrb,
  elapsed: number,
  palette: LiveOrbPalette,
  isFocused: boolean,
  isDragged: boolean,
  reducedMotion: boolean
): void {
  const coil = orb.coilProgress;
  if (coil <= 0.01) return;

  const { x, y, currentRadius: R } = orb;
  if (R < 2) return;

  const energyBoost =
    1 +
    orb.pingEnergy * 0.55 +
    (isFocused ? 0.38 : 0) +
    (isDragged ? 0.3 : 0) +
    (1 - coil) * 0.45;

  // 1. Wide ethereal outer neon halo aura
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const haloR = R * (2.35 + orb.pingEnergy * 0.35);
  const haloGrad = ctx.createRadialGradient(x, y, R * 0.42, x, y, haloR);
  haloGrad.addColorStop(0, rgbaStr(palette.accent, 0.24 * energyBoost * coil));
  haloGrad.addColorStop(0.45, rgbaStr(palette.primary, 0.18 * energyBoost * coil));
  haloGrad.addColorStop(0.78, rgbaStr(palette.primary, 0.05 * coil));
  haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Dark translucent liquid droplet interior condensing smoothly inside the coiling rings
  const coreCondense = smoothstep(0.16, 0.84, coil);
  if (coreCondense > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = coreCondense;
    traceLiquidDropletPath(
      ctx,
      x,
      y,
      R * (0.72 + 0.22 * coreCondense),
      elapsed,
      orb,
      reducedMotion,
      44
    );
    const coreGrad = ctx.createRadialGradient(
      x - R * 0.14,
      y - R * 0.18,
      R * 0.08,
      x,
      y,
      R * 1.02
    );
    coreGrad.addColorStop(0, 'rgba(5, 3, 15, 0.94)');
    coreGrad.addColorStop(0.68, rgbaStr(palette.deep, 0.9));
    coreGrad.addColorStop(0.92, rgbaStr(palette.primary, 0.36));
    coreGrad.addColorStop(1, rgbaStr(palette.accent, 0.45));
    ctx.fillStyle = coreGrad;
    ctx.fill();

    // Subtle curved water-droplet meniscus refraction highlight
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(
      x - R * 0.28,
      y - R * 0.34,
      R * 0.46,
      R * 0.24,
      -Math.PI * 0.24,
      0,
      Math.PI * 2
    );
    const sheenGrad = ctx.createRadialGradient(
      x - R * 0.32,
      y - R * 0.38,
      1,
      x - R * 0.28,
      y - R * 0.34,
      R * 0.5
    );
    sheenGrad.addColorStop(0, rgbaStr(palette.hot, 0.24 * coreCondense));
    sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheenGrad;
    ctx.fill();
    ctx.restore();
  }

  // 3. Multi-layered Swirling Plasma Ribbon Rings that physically wind closed as coil -> 1!
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const maxSteps = 44;

  for (let k = 0; k < orb.rings.length; k++) {
    const ring = orb.rings[k];
    // Stagger each of the 7 rings so they coil into place one after another seamlessly
    const ringArcFrac = clamp01(coil * 1.48 - k * 0.072);
    if (ringArcFrac <= 0.02) continue;

    const tScale = reducedMotion ? 0.22 : 1;
    const precess =
      ring.offsetAngle + elapsed * ring.precessSpeed * tScale + orb.coilAngleAccum * 0.55;
    const ox = Math.cos(precess) * R * ring.offsetDist;
    const oy = Math.sin(precess) * R * ring.offsetDist;
    const tilt = ring.tilt + elapsed * ring.spinSpeed * tScale + orb.coilAngleAccum * 0.85;
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);

    const drawSteps = Math.max(4, Math.ceil(maxSteps * ringArcFrac));
    const totalArc = Math.PI * 2 * ringArcFrac;
    const isClosed = ringArcFrac >= 0.995;

    ctx.beginPath();
    let firstX = 0;
    let firstY = 0;
    for (let s = 0; s <= drawSteps; s++) {
      const frac = s / drawSteps;
      const theta = frac * totalArc;
      const dropScale = evalDropletRadiusScale(theta + tilt, elapsed, orb, reducedMotion);
      const plasmaWave =
        1 + Math.sin(ring.waveFreq * theta + elapsed * ring.waveSpeed * tScale + k) * ring.waveAmp;

      // Slight radial spiral-in during the active winding phase
      const windIn = isClosed ? 1 : 1 + (1 - ringArcFrac) * (1 - frac) * 0.28;

      const lx = Math.cos(theta) * R * ring.rxScale * dropScale * plasmaWave * windIn;
      const ly = Math.sin(theta) * R * ring.ryScale * dropScale * plasmaWave * windIn;

      const rx = x + ox + lx * cosT - ly * sinT;
      const ry = y + oy + lx * sinT + ly * cosT;

      if (s === 0) {
        firstX = rx;
        firstY = ry;
        ctx.moveTo(rx, ry);
      } else if (isClosed && s === drawSteps) {
        ctx.lineTo(firstX, firstY);
      } else {
        ctx.lineTo(rx, ry);
      }
    }
    if (isClosed) ctx.closePath();

    const ringColor = ring.useAccent ? palette.accent : palette.primary;
    const ringAlpha = Math.min(1, ringArcFrac * 1.25);

    // Pass A: Soft luminous neon plasma ribbon aura
    ctx.strokeStyle = rgbaStr(ringColor, 0.22 * ring.alphaBoost * energyBoost * ringAlpha);
    ctx.lineWidth = Math.max(2.6, R * 0.145);
    ctx.stroke();

    // Pass B: Razor-bright incandescent filament core
    ctx.strokeStyle = rgbaStr(
      ring.useAccent ? palette.hot : palette.accent,
      0.54 * ring.alphaBoost * energyBoost * ringAlpha
    );
    ctx.lineWidth = Math.max(1.05, R * 0.032);
    ctx.stroke();
  }

  // 4. Orbiting shimmering micro-stardust speckles around each orb's turbulent plasma halo
  const sparkFade = smoothstep(0.4, 0.95, coil);
  if (sparkFade > 0.01) {
    for (let j = 0; j < orb.sparks.length; j++) {
      const sp = orb.sparks[j];
      const a = sp.angle + elapsed * sp.speed * (reducedMotion ? 0.2 : 1);
      const dist = R * (sp.distFactor + Math.sin(elapsed * 1.4 + sp.phase) * 0.07);
      const sx = x + Math.cos(a) * dist;
      const sy = y + Math.sin(a) * dist;
      const tw = 0.35 + 0.65 * Math.sin(elapsed * 2.8 + sp.phase);

      ctx.beginPath();
      ctx.arc(sx, sy, sp.size * (0.7 + sparkFade * 0.3), 0, Math.PI * 2);
      ctx.fillStyle = rgbaStr(j % 3 === 0 ? palette.hot : palette.accent, 0.65 * tw * sparkFade);
      ctx.fill();
    }
  }
  ctx.restore();

  // 5. Crisp Glowing Rank Indicator centered right inside the dark hollow orb core
  const textAlpha = smoothstep(0.48, 0.92, coil);
  if (textAlpha > 0.01) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const rankFontPx = Math.round(Math.max(13, R * 0.52));
    ctx.font = `700 ${rankFontPx}px "Space Grotesk", "Inter", system-ui, sans-serif`;
    ctx.shadowColor = rgbaStr(palette.accent, 0.85);
    ctx.shadowBlur = 12 + orb.pingEnergy * 10;
    ctx.fillStyle = rgbaStr({ r: 255, g: 252, b: 255 }, 0.96 * textAlpha);
    ctx.fillText(`#${orb.rank}`, x, y - R * 0.07);

    const scoreFontPx = Math.round(Math.max(9, R * 0.25));
    ctx.font = `500 ${scoreFontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.shadowBlur = 6;
    ctx.fillStyle = rgbaStr(palette.hot, (0.74 + orb.pingEnergy * 0.26) * textAlpha);
    ctx.fillText(`${orb.product.overallScore} PTS`, x, y + R * 0.31);
    ctx.restore();
  }
}

/**
 * Draws a razor-thin radar telemetry leader line connecting each coiled orb's
 * outer aura cleanly to its anchored floating data caption.
 */
export function drawCalloutLeaderLine(
  ctx: CanvasRenderingContext2D,
  orb: FloatingRadarOrb,
  palette: LiveOrbPalette,
  isFocused: boolean
): void {
  const fade = orb.labelOpacity;
  if (fade <= 0.01) return;

  const isRight = orb.labelSide === 'right';
  const dir = isRight ? 1 : -1;
  const startX = orb.x + dir * (orb.currentRadius * 1.12);
  const startY = orb.y;
  const endX = orb.labelX - dir * 5;
  const endY = orb.labelY + 2;
  const midX = startX + (endX - startX) * 0.46;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const alpha = (0.34 + orb.pingEnergy * 0.45 + (isFocused ? 0.35 : 0)) * fade;

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(midX, endY);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = rgbaStr(
    isFocused || orb.pingEnergy > 0.25 ? palette.hot : palette.accent,
    alpha
  );
  ctx.lineWidth = isFocused ? 1.25 : 0.9;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(endX, endY, isFocused ? 2.4 : 1.7, 0, Math.PI * 2);
  ctx.fillStyle = rgbaStr(palette.hot, Math.min(1, alpha * 1.65));
  ctx.fill();
  ctx.restore();
}

/**
 * Evaluates a point along a smooth rounded-rectangle Card perimeter (exact superellipse
 * matched to the 3D Main Core shader's pow(|cos|, 0.32) border contour) with optional
 * organic liquid light undulation along the outward normal.
 */
function sampleCardBorderPoint(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  theta: number,
  radialPadPx: number,
  waveOffsetPx: number,
  out: { x: number; y: number }
): void {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const sx = (c >= 0 ? 1 : -1) * Math.pow(Math.max(0.0001, Math.abs(c)), 0.32);
  const sy = (s >= 0 ? 1 : -1) * Math.pow(Math.max(0.0001, Math.abs(s)), 0.32);

  // Smooth outward normal along the rounded-rect contour
  const nxRaw = sx / Math.max(1, halfW);
  const nyRaw = sy / Math.max(1, halfH);
  const nLen = Math.hypot(nxRaw, nyRaw) || 1;
  const nx = nxRaw / nLen;
  const ny = nyRaw / nLen;

  const offset = radialPadPx + waveOffsetPx;
  out.x = cx + sx * halfW + nx * offset;
  out.y = cy + sy * halfH + ny * offset;
}

/**
 * Draws a soft atmospheric neon back-halo behind each Ranked Image Card on the Radar canvas.
 */
export function drawCardAmbientBackHalo(
  ctx: CanvasRenderingContext2D,
  orb: FloatingRadarOrb,
  palette: LiveOrbPalette,
  isFocused: boolean,
  isDragged: boolean,
  dimFactor: number
): void {
  const coil = orb.coilProgress;
  if (coil <= 0.02) return;

  const halfW = orb.cardWidth * orb.currentScale * 0.5;
  const halfH = orb.cardHeight * orb.currentScale * 0.5;
  const haloR = Math.hypot(halfW, halfH) * (1.28 + orb.pingEnergy * 0.16 + (isFocused ? 0.18 : 0));
  const boost = (1 + orb.pingEnergy * 0.65 + (isFocused ? 0.45 : 0) + (isDragged ? 0.3 : 0)) * dimFactor;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(orb.x, orb.y, Math.min(halfW, halfH) * 0.45, orb.x, orb.y, haloR);
  grad.addColorStop(0, rgbaStr(palette.accent, 0.2 * boost * coil));
  grad.addColorStop(0.56, rgbaStr(palette.primary, 0.13 * boost * coil));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(orb.x, orb.y, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Renders living, multi-layered swirling luminous plasma ribbons physically coiling
 * around each Ranked Image Card's rounded-rectangle border!
 * - Winds shut seamlessly in sync with the 3D Main Core's 16 arriving ribbons (`coilProgress 0 -> 1`).
 * - Leaves the Product Image & Details inside the Card 100% crisp and unobstructed.
 * - Flashes dynamically when the 360° Radar sweep beam pings the Card or when focused/dragged.
 */
export function drawCardCoilingBorderLights(
  ctx: CanvasRenderingContext2D,
  orb: FloatingRadarOrb,
  elapsed: number,
  palette: LiveOrbPalette,
  isFocused: boolean,
  isDragged: boolean,
  reducedMotion: boolean,
  dimFactor = 1
): void {
  const coil = orb.coilProgress;
  if (coil <= 0.015) return;

  const halfW = orb.cardWidth * orb.currentScale * 0.5;
  const halfH = orb.cardHeight * orb.currentScale * 0.5;
  if (halfW < 12 || halfH < 12) return;

  const tScale = reducedMotion ? 0.2 : 1;
  const energyBoost =
    (1 +
      orb.pingEnergy * 0.65 +
      (isFocused ? 0.42 : 0) +
      (isDragged ? 0.35 : 0) +
      (1 - coil) * 0.5) *
    dimFactor;
  const wobbleAmp = (1 + orb.wobbleEnergy * 1.85 + orb.pingEnergy * 0.75) * (reducedMotion ? 0.28 : 1);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const pt = { x: orb.x, y: orb.y };
  const strandCount = 5;
  const maxSteps = 56;

  // 1. Interlocking coiling plasma strands wrapping continuously around the Card's 4 edges & corners
  for (let k = 0; k < strandCount; k++) {
    const ring = orb.rings[k % orb.rings.length];
    const strandArcFrac = clamp01(coil * 1.44 - k * 0.085);
    if (strandArcFrac <= 0.02) continue;

    const dir = k % 2 === 0 ? 1 : -1;
    const isClosed = strandArcFrac >= 0.995;
    const totalArc = Math.PI * 2 * strandArcFrac;
    const drawSteps = Math.max(6, Math.ceil(maxSteps * strandArcFrac));

    // Orbit start angle smoothly around the perimeter with residual core spin momentum
    const startAngle =
      ring.offsetAngle +
      elapsed * (0.48 + k * 0.14) * dir * tScale +
      orb.coilAngleAccum * 0.42 * dir;

    // Slight radial layering so strands braid organically around the card edge without covering inner details
    const basePadPx = 1.5 + k * 1.85 + (isFocused ? 1.5 : 0);

    ctx.beginPath();
    let firstX = 0;
    let firstY = 0;
    for (let s = 0; s <= drawSteps; s++) {
      const frac = s / drawSteps;
      const theta = startAngle + frac * totalArc * dir;

      // Living fluid undulation breathing gently outside the card rim
      const waveA = Math.sin(theta * (3 + (k % 2)) - elapsed * (1.85 + k * 0.32) * dir * tScale + orb.p2 + k * 1.7);
      const waveB = Math.cos(theta * 5 + elapsed * 1.35 * dir * tScale + orb.p3 + k * 2.3);
      const windFlare = isClosed ? 0 : (1 - strandArcFrac) * (1 - frac) * 14;
      const waveOffset = (waveA * 2.2 + waveB * 1.2) * wobbleAmp + windFlare;

      sampleCardBorderPoint(orb.x, orb.y, halfW, halfH, theta, basePadPx, waveOffset, pt);

      if (s === 0) {
        firstX = pt.x;
        firstY = pt.y;
        ctx.moveTo(pt.x, pt.y);
      } else if (isClosed && s === drawSteps) {
        ctx.lineTo(firstX, firstY);
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    if (isClosed) ctx.closePath();

    const strandColor = k % 2 === 0 ? palette.primary : palette.accent;
    const strandAlpha = Math.min(1, strandArcFrac * 1.25);

    // Pass A: Soft luminous neon ribbon aura around card border
    ctx.strokeStyle = rgbaStr(strandColor, 0.2 * ring.alphaBoost * energyBoost * strandAlpha);
    ctx.lineWidth = isFocused ? 5.6 : 4.2;
    ctx.stroke();

    // Pass B: Crisp incandescent filament core coiling tightly on the border
    ctx.strokeStyle = rgbaStr(
      k === 0 || k === 3 ? palette.hot : palette.accent,
      (k === 0 ? 0.62 : 0.44) * ring.alphaBoost * energyBoost * strandAlpha
    );
    ctx.lineWidth = k === 0 ? 1.55 : 1.05;
    ctx.stroke();
  }

  // 2. Two high-velocity luminous comet runners gliding around the Card's border
  const runnerFade = smoothstep(0.45, 0.96, coil) * dimFactor;
  if (runnerFade > 0.02) {
    for (let r = 0; r < 2; r++) {
      const dir = r === 0 ? 1 : -1;
      const headAngle =
        elapsed * (1.25 + r * 0.42) * dir * tScale + orb.p2 + r * Math.PI + orb.coilAngleAccum * 0.3;
      const tailLen = 0.72;
      const segs = 14;

      ctx.beginPath();
      for (let s = 0; s <= segs; s++) {
        const frac = s / segs;
        const theta = headAngle - dir * (1 - frac) * tailLen;
        const wave = Math.sin(theta * 4 - elapsed * 2.4 * dir * tScale + r * 2.1) * 1.6 * wobbleAmp;
        sampleCardBorderPoint(orb.x, orb.y, halfW, halfH, theta, 2.2 + r * 2.4, wave, pt);
        if (s === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }

      ctx.strokeStyle = rgbaStr(r === 0 ? palette.hot : palette.accent, 0.72 * runnerFade * energyBoost);
      ctx.lineWidth = isFocused ? 2.4 : 1.85;
      ctx.stroke();

      // Bright leading spark head on the border
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isFocused ? 2.6 : 2.0, 0, Math.PI * 2);
      ctx.fillStyle = rgbaStr({ r: 255, g: 252, b: 255 }, Math.min(1, 0.88 * runnerFade * energyBoost));
      ctx.fill();
    }
  }

  // 3. Delicate orbiting micro-stardust sparks shimmering around the outer Card frame
  const sparkFade = smoothstep(0.5, 0.98, coil) * dimFactor;
  if (sparkFade > 0.02) {
    const sparkCount = Math.min(10, orb.sparks.length);
    for (let j = 0; j < sparkCount; j++) {
      const sp = orb.sparks[j];
      const theta = sp.angle + elapsed * sp.speed * 0.85 * tScale;
      const pad = 6 + (sp.distFactor - 1.0) * 18 + Math.sin(elapsed * 1.6 + sp.phase) * 3;
      sampleCardBorderPoint(orb.x, orb.y, halfW, halfH, theta, pad, 0, pt);
      const tw = 0.32 + 0.68 * Math.sin(elapsed * 2.9 + sp.phase);

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, sp.size * (0.75 + sparkFade * 0.25), 0, Math.PI * 2);
      ctx.fillStyle = rgbaStr(j % 3 === 0 ? palette.hot : palette.accent, 0.62 * tw * sparkFade);
      ctx.fill();
    }
  }

  ctx.restore();
}
