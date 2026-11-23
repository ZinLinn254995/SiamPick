export type CoreLifecyclePhase = 'birth' | 'idle';

export interface BirthChoreographyState {
  phase: CoreLifecyclePhase;
  /** Overall normalized birth progress [0..1] */
  progress: number;
  /** Beat 1-2: Tiny luminous central spark ignition [0..1] */
  singularityPoint: number;
  /** Beat 3: Outer particles emerging & accelerating inward [0..1] */
  particleVisibility: number;
  /** Beat 3-6: Particle radial convergence -> expansion curve [0 = far, 1 = gathered at center, settled = 0.52] */
  particleGather: number;
  /** Beat 4: Converging radial energy filaments intensity [0..1] */
  convergeLines: number;
  /** Beat 4: Inward pulse flow progress along converging lines [0..1] */
  convergeFlow: number;
  /** Beat 5: Progressive reveal for concentric rings [inner, stator, logic, outer] */
  ringReveal: [number, number, number, number];
  /** Beat 6: Outward electromagnetic expansion shockwave radius [0..1] */
  outwardWave: number;
  /** Beat 6: Circuit matrix & radial conduit illumination [0..1] */
  circuitReveal: number;
  /** Beat 7: Central Digital Core 3D plasma & crystal cage materialization [0..1] */
  coreMaterialize: number;
  /** Beat 7: Mechanical titanium aperture fins radial unfold [0..1] */
  apertureUnfold: number;
  /** Beat 7-8: Peak ignition luminance bloom that settles smoothly into idle */
  ignitionSurge: number;
  /** Beat 8: Smooth blend into calm living Normal / Idle state [0..1] */
  idleBlend: number;
  /** Subtle ambient substrate grid visibility [0..1] */
  substrateReveal: number;
}

export const BIRTH_DURATION_SECONDS = 6.8;
export const REDUCED_MOTION_BIRTH_DURATION = 1.4;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function windowProgress(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0;
  return clamp01((t - start) / (end - start));
}

function easeOutCubic(x: number): number {
  const inv = 1 - clamp01(x);
  return 1 - inv * inv * inv;
}

function easeInOutCubic(x: number): number {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutQuint(x: number): number {
  const inv = 1 - clamp01(x);
  return 1 - inv * inv * inv * inv * inv;
}

function easeOutExpo(x: number): number {
  const t = clamp01(x);
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function bellCurve(x: number): number {
  const t = clamp01(x);
  return Math.sin(t * Math.PI);
}

/**
 * Evaluates all synchronized Stage 01 (Birth) -> Stage 02 (Normal State) channels
 * into the provided mutable output object (zero per-frame allocations).
 */
export function evaluateBirthChoreography(
  birthElapsed: number,
  reducedMotion: boolean,
  out: BirthChoreographyState
): BirthChoreographyState {
  if (reducedMotion) {
    const p = clamp01(birthElapsed / REDUCED_MOTION_BIRTH_DURATION);
    const e = easeOutCubic(p);
    out.phase = p >= 1 ? 'idle' : 'birth';
    out.progress = p;
    out.singularityPoint = e;
    out.particleVisibility = e;
    out.particleGather = 0;
    out.convergeLines = e * 0.45;
    out.convergeFlow = e;
    out.ringReveal[0] = e;
    out.ringReveal[1] = e;
    out.ringReveal[2] = e;
    out.ringReveal[3] = e;
    out.outwardWave = 0;
    out.circuitReveal = e;
    out.coreMaterialize = e;
    out.apertureUnfold = e;
    out.ignitionSurge = 0;
    out.idleBlend = e;
    out.substrateReveal = e;
    return out;
  }

  const t = Math.max(0, birthElapsed);
  const progress = clamp01(t / BIRTH_DURATION_SECONDS);

  // Beat 1 (0.00 - 0.35s): Almost completely dark screen
  // Beat 2 (0.30 - 1.20s): Tiny pinpoint of light ignites at the center
  const singularityPoint = easeOutExpo(windowProgress(t, 0.3, 1.35));

  // Beat 3 (0.85 - 2.35s): Particles emerge and gather inward toward the center
  const particleVisibility = easeOutCubic(windowProgress(t, 0.85, 2.05));
  const gatherIn = easeInOutCubic(windowProgress(t, 0.95, 2.55));
  const expandOut = easeOutQuint(windowProgress(t, 3.25, 5.15));
  // Positive particleGather pulls particles tightly inward; returns smoothly to 0 in idle
  const particleGather = gatherIn * (1 - expandOut);

  // Beat 4 (1.35 - 3.05s): Thin luminous energy lines converge toward the center
  const linesIn = easeOutCubic(windowProgress(t, 1.35, 2.35));
  const linesSettle = easeInOutCubic(windowProgress(t, 4.4, 6.2));
  const convergeLines = linesIn * (1 - linesSettle * 0.62);
  const convergeFlow = easeInOutCubic(windowProgress(t, 1.35, 4.2));

  // Beat 5 (2.10 - 4.35s): Concentric digital rings progressively materialize inner -> outer
  out.ringReveal[0] = easeOutCubic(windowProgress(t, 2.1, 3.15));
  out.ringReveal[1] = easeOutCubic(windowProgress(t, 2.5, 3.65));
  out.ringReveal[2] = easeOutCubic(windowProgress(t, 2.95, 4.1));
  out.ringReveal[3] = easeOutCubic(windowProgress(t, 3.4, 4.55));

  // Beat 6 (3.30 - 5.10s): Energy expands outward across concentric layers
  const outwardWaveRaw = windowProgress(t, 3.3, 5.15);
  const outwardWave = outwardWaveRaw > 0 && outwardWaveRaw < 1 ? easeOutCubic(outwardWaveRaw) : 0;
  const circuitReveal = easeOutCubic(windowProgress(t, 3.2, 4.95));

  // Beat 7 (4.15 - 5.65s): Central Digital Core materializes and becomes fully illuminated
  const coreMaterialize = easeOutQuint(windowProgress(t, 4.05, 5.55));
  const apertureUnfold = easeOutCubic(windowProgress(t, 4.25, 5.85));

  // Luminous birth surge peaks as core materializes and settles smoothly into Normal State
  const ignitionSurge =
    bellCurve(windowProgress(t, 3.35, 5.95)) * 0.9 +
    bellCurve(windowProgress(t, 0.45, 2.5)) * 0.35;

  // Beat 8 (5.40 - 6.80s): Energy settles into stable, living Normal State
  const idleBlend = easeInOutCubic(windowProgress(t, 5.35, BIRTH_DURATION_SECONDS));
  const substrateReveal = easeOutCubic(windowProgress(t, 2.8, 5.2));

  out.phase = progress >= 1 ? 'idle' : 'birth';
  out.progress = progress;
  out.singularityPoint = singularityPoint;
  out.particleVisibility = particleVisibility;
  out.particleGather = particleGather;
  out.convergeLines = convergeLines;
  out.convergeFlow = convergeFlow;
  out.outwardWave = outwardWave;
  out.circuitReveal = circuitReveal;
  out.coreMaterialize = coreMaterialize;
  out.apertureUnfold = apertureUnfold;
  out.ignitionSurge = ignitionSurge;
  out.idleBlend = idleBlend;
  out.substrateReveal = substrateReveal;

  return out;
}

export function createInitialBirthState(): BirthChoreographyState {
  return {
    phase: 'birth',
    progress: 0,
    singularityPoint: 0,
    particleVisibility: 0,
    particleGather: 0,
    convergeLines: 0,
    convergeFlow: 0,
    ringReveal: [0, 0, 0, 0],
    outwardWave: 0,
    circuitReveal: 0,
    coreMaterialize: 0,
    apertureUnfold: 0,
    ignitionSurge: 0,
    idleBlend: 0,
    substrateReveal: 0,
  };
}
