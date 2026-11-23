/**
 * Deterministic Animation State Machine for SiamPick — Corrected Engine Awakening Sequence:
 *
 *  1. IDLE                  — Stable living Digital Core (steady gyroscopic rotation)
 *  2. CHARGING              — Long press starts: internal structures accelerate & begin contracting;
 *                             external space-wide energy waves awaken
 *  3. IMPACT_WAVES          — 4 rhythmic Gather -> Coin-Rim Orbit -> Strike -> Absorb impact cycles
 *                             with synchronized visual shock pulses & haptic event triggers;
 *                             internal collapse intensifies while outer Core remains stable
 *  4. WHITE_CORE_STILLNESS  — Autonomous lock: final compression into one intensely luminous pure
 *                             white sphere, then COMPLETE STILLNESS pause under peak tension
 *  5. REVERSE_EXPLOSION     — Sudden reverse-direction violent outward explosion (no gradual fade)
 *  6. BLACKOUT              — Instant camera-shutter cut to 100% pure black; brief mandatory hold
 *  7. WELCOME               — Restrained Welcome screen fade-in only after the blackout pause
 *
 * Zero per-frame allocations: mutates a single pre-allocated AwakeningFrameSnapshot.
 */

export type AwakeningStage =
  | 'IDLE'
  | 'CHARGING'
  | 'IMPACT_WAVES'
  | 'WHITE_CORE_STILLNESS'
  | 'REVERSE_EXPLOSION'
  | 'BLACKOUT'
  | 'WELCOME';

export interface AwakeningFrameSnapshot {
  stage: AwakeningStage;
  /** True once autonomous ignition threshold is reached (finger release will not interrupt) */
  isAutonomous: boolean;
  /** Continuous pre-ignition hold progress [0..1] */
  chargeProgress: number;
  /** Normalized progress within the active stage [0..1] */
  stageProgress: number;
  /** Overall pre-ignition charging intensity [0..1] */
  chargingEnergy: number;
  /** Internal structure inward contraction factor [0..1] (ONLY affects internal Core layers) */
  internalCollapse: number;
  /** Internal rapid rotation blur intensity [0..1] (ONLY affects internal Core layers) */
  internalBlur: number;
  /** Visibility & presence of external space-wide orbital energy waves [0..1] */
  waveActivity: number;
  /** Current rhythmic impact cycle progress [0..1] (0..0.55 gather/orbit, 0.55..0.78 strike, 0.78..1.0 absorb) */
  waveCycle: number;
  /** Sharp visual impact pulse [0..1] firing on every rhythmic wave strike (1..4) and white-core lock */
  impactPulse: number;
  /** Intensity tier [0..1] of the most recent strike (progressively stronger 1 -> 4 -> lock -> explosion) */
  impactStrength: number;
  /** Monotonic counter incremented exactly once on each strike/lock/explosion for haptic sync */
  impactEventId: number;
  /** Pure white compressed sphere transition [0..1] (reaches 1.0 in WHITE_CORE_STILLNESS) */
  whiteCoreLevel: number;
  /** Global motion freeze factor [0..1] (1.0 = complete dead stillness during white-sphere pause) */
  motionFreeze: number;
  /** Sudden outward reverse explosion progress [0..1] (0 outside REVERSE_EXPLOSION, peaks hard at 1.0) */
  explosionProgress: number;
  /** Active explosion visual intensity [0..1] (stays blazing hot right up to blackout cut, no gradual fade) */
  explosionIntensity: number;
  /** Instant camera-shutter pure blackout flag (true throughout BLACKOUT and WELCOME) */
  isBlackout: boolean;
  /** Smooth Welcome text reveal [0..1] (strictly 0 until BLACKOUT finishes) */
  welcomeUiReveal: number;
  /** Signed angular velocity (rad/s) for INTERNAL Core structures (accelerates +, stops 0, snaps - on explosion) */
  internalAngularSpeed: number;
  /** Accumulated angular phase for internal Core structures */
  internalSpinPhase: number;
  /** Signed angular velocity (rad/s) for EXTERNAL coin-rim orbital waves (+ during gather/orbit, - during explosion) */
  waveOrbitSpeed: number;
  /** Accumulated orbital phase for external coin-rim waves */
  waveOrbitPhase: number;
  /** Monotonic wave twist phase for external energy ribbons */
  waveTwistPhase: number;
  /** Subtle camera framing offset (tactile recoil kick on each strike + subtle pull-in) */
  cameraZoomOffset: number;
  /** Coordinated bloom strength boost */
  bloomBoost: number;
}

// Pre-ignition hold tuning
const CHARGE_TOTAL_DURATION = 4.0; // seconds of steady hold to reach White Core autonomous lock
const CHARGE_DECAY_RATE = 0.78; // smooth safe unwind if released before ignition
const REDUCED_MOTION_CHARGE_DURATION = 1.65;

const STAGE_IMPACT_START = 0.22;
const IMPACT_BEAT_COUNT = 4;

// Post-ignition autonomous stage durations (seconds)
const WHITE_STILLNESS_DURATION = 0.96; // 0.28s white compression + 0.68s complete stillness hold
const EXPLOSION_DURATION = 0.46; // fast violent reverse outward blast, NO gradual fade-out
const BLACKOUT_DURATION = 0.78; // mandatory pure-black camera shutter pause
const WELCOME_FADE_DURATION = 0.85; // restrained Welcome text reveal after blackout

const REDUCED_STILLNESS_DURATION = 0.64;
const REDUCED_EXPLOSION_DURATION = 0.30;
const REDUCED_BLACKOUT_DURATION = 0.56;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function window01(value: number, start: number, end: number): number {
  if (end <= start) return value >= end ? 1 : 0;
  return clamp01((value - start) / (end - start));
}

function easeInQuad(x: number): number {
  const t = clamp01(x);
  return t * t;
}

function easeInCubic(x: number): number {
  const t = clamp01(x);
  return t * t * t;
}

function easeOutCubic(x: number): number {
  const inv = 1 - clamp01(x);
  return 1 - inv * inv * inv;
}

function easeInOutCubic(x: number): number {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutQuart(x: number): number {
  const inv = 1 - clamp01(x);
  return 1 - inv * inv * inv * inv;
}

export function createInitialAwakeningSnapshot(): AwakeningFrameSnapshot {
  return {
    stage: 'IDLE',
    isAutonomous: false,
    chargeProgress: 0,
    stageProgress: 0,
    chargingEnergy: 0,
    internalCollapse: 0,
    internalBlur: 0,
    waveActivity: 0,
    waveCycle: 0,
    impactPulse: 0,
    impactStrength: 0,
    impactEventId: 0,
    whiteCoreLevel: 0,
    motionFreeze: 0,
    explosionProgress: 0,
    explosionIntensity: 0,
    isBlackout: false,
    welcomeUiReveal: 0,
    internalAngularSpeed: 0,
    internalSpinPhase: 0,
    waveOrbitSpeed: 0,
    waveOrbitPhase: 0,
    waveTwistPhase: 0,
    cameraZoomOffset: 0,
    bloomBoost: 0,
  };
}

export class AwakeningStateMachine {
  public readonly snapshot: AwakeningFrameSnapshot = createInitialAwakeningSnapshot();

  private chargeProgress = 0;
  private isAutonomous = false;
  private postIgnitionTime = 0;

  private smoothedInternalSpeed = 0;
  private smoothedWaveOrbitSpeed = 0;
  private internalSpinPhase = 0;
  private waveOrbitPhase = 0;
  private waveTwistPhase = 0;

  // Impact beat tracking (guarantees each strike fires haptic/visual pulse once, never duplicated)
  private lastTriggeredBeat = -1;
  private impactPulseEnv = 0;
  private lastImpactStrength = 0;
  private impactEventId = 0;
  private triggeredWhiteLockHaptic = false;
  private triggeredExplosionHaptic = false;

  public update(
    dt: number,
    isHolding: boolean,
    canCharge: boolean,
    reducedMotion: boolean
  ): AwakeningFrameSnapshot {
    const safeDt = Math.min(0.05, Math.max(0.0001, dt));
    const s = this.snapshot;

    const chargeDuration = reducedMotion ? REDUCED_MOTION_CHARGE_DURATION : CHARGE_TOTAL_DURATION;
    const stillnessDur = reducedMotion ? REDUCED_STILLNESS_DURATION : WHITE_STILLNESS_DURATION;
    const explosionDur = reducedMotion ? REDUCED_EXPLOSION_DURATION : EXPLOSION_DURATION;
    const blackoutDur = reducedMotion ? REDUCED_BLACKOUT_DURATION : BLACKOUT_DURATION;

    const explosionStart = stillnessDur;
    const blackoutStart = explosionStart + explosionDur;
    const welcomeStart = blackoutStart + blackoutDur;

    // Exponential decay for sharp visual impact pulse
    this.impactPulseEnv *= Math.exp(-8.5 * safeDt);
    if (this.impactPulseEnv < 0.001) {
      this.impactPulseEnv = 0;
    }

    // -------------------------------------------------------------------------
    // 1. ADVANCE STATE TRANSITIONS (Prevent duplicate triggers & overlapping timelines)
    // -------------------------------------------------------------------------
    if (!this.isAutonomous) {
      if (canCharge && isHolding) {
        this.chargeProgress = Math.min(1, this.chargeProgress + safeDt / chargeDuration);
        if (this.chargeProgress >= 1) {
          // Crossed ignition threshold: lock autonomous White Core -> Stillness -> Explosion -> Blackout -> Welcome
          this.isAutonomous = true;
          this.postIgnitionTime = 0;
          if (!this.triggeredWhiteLockHaptic) {
            this.triggeredWhiteLockHaptic = true;
            this.impactPulseEnv = 1.0;
            this.lastImpactStrength = 0.92;
            this.impactEventId++;
          }
        }
      } else if (this.chargeProgress > 0) {
        // Safe smooth cancellation if user releases before ignition
        this.chargeProgress = Math.max(0, this.chargeProgress - safeDt * CHARGE_DECAY_RATE);
        // Reset beat tracking smoothly as charge unwinds so re-holding feels fresh
        const currentBeat = Math.floor(
          window01(this.chargeProgress, STAGE_IMPACT_START, 1.0) * IMPACT_BEAT_COUNT
        );
        if (this.lastTriggeredBeat >= currentBeat) {
          this.lastTriggeredBeat = currentBeat - 1;
        }
        if (this.chargeProgress <= 0.0005) {
          this.chargeProgress = 0;
          this.lastTriggeredBeat = -1;
        }
      }
    } else {
      this.postIgnitionTime += safeDt;
    }

    // -------------------------------------------------------------------------
    // 2. DETERMINE STAGE & EVALUATE CONTINUOUS CHANNELS
    // -------------------------------------------------------------------------
    const motionCap = reducedMotion ? 0.36 : 1.0;
    let targetInternalSpeed = 0;
    let targetWaveOrbitSpeed = 0;
    let speedLambda = 7.5;

    if (!this.isAutonomous) {
      const cp = this.chargeProgress;
      s.isAutonomous = false;
      s.chargeProgress = cp;
      s.isBlackout = false;
      s.motionFreeze = 0;
      s.explosionProgress = 0;
      s.explosionIntensity = 0;
      s.welcomeUiReveal = 0;

      if (cp <= 0.0005) {
        s.stage = 'IDLE';
        s.stageProgress = 0;
      } else if (cp < STAGE_IMPACT_START) {
        s.stage = 'CHARGING';
        s.stageProgress = window01(cp, 0, STAGE_IMPACT_START);
      } else {
        s.stage = 'IMPACT_WAVES';
        s.stageProgress = window01(cp, STAGE_IMPACT_START, 1.0);
      }

      const chargeRamp = easeInOutCubic(cp);
      s.chargingEnergy = chargeRamp;

      // Internal collapse progressively contracts internal layers toward nucleus (outer Core stays intact!)
      s.internalCollapse = easeInOutCubic(window01(cp, 0.04, 0.96));
      s.internalBlur = easeInQuad(window01(cp, 0.42, 1.0));

      // External space-wide waves awaken during CHARGING and intensify through IMPACT_WAVES
      s.waveActivity = easeOutCubic(window01(cp, 0.08, 0.30));

      // 4 distinct rhythmic cycles: gather (0..0.54) -> accelerate -> STRIKE (0.56) -> absorb (0.76..1.0)
      const impactWin = window01(cp, STAGE_IMPACT_START, 1.0);
      if (impactWin > 0 && impactWin < 1) {
        const scaled = impactWin * IMPACT_BEAT_COUNT;
        const beatIdx = Math.min(IMPACT_BEAT_COUNT - 1, Math.floor(scaled));
        const cycleFrac = scaled - beatIdx;
        s.waveCycle = cycleFrac;

        // Fire discrete strike pulse once per beat right at the impact crest (cycleFrac >= 0.56)
        if (isHolding && cycleFrac >= 0.56 && beatIdx > this.lastTriggeredBeat) {
          this.lastTriggeredBeat = beatIdx;
          const strength = 0.42 + (beatIdx / (IMPACT_BEAT_COUNT - 1)) * 0.52; // 0.42 -> 0.59 -> 0.77 -> 0.94
          this.impactPulseEnv = Math.max(this.impactPulseEnv, strength);
          this.lastImpactStrength = strength;
          this.impactEventId++;
        }
      } else {
        s.waveCycle = cp > 0 ? window01(cp, 0, STAGE_IMPACT_START) * 0.45 : 0;
      }

      // Luminous compression toward White Core builds progressively on final beats
      s.whiteCoreLevel = easeInCubic(window01(cp, 0.72, 1.0)) * 0.72 + this.impactPulseEnv * 0.14 * window01(cp, 0.55, 1.0);

      // Rapid internal rotation around Core central axis (accelerates progressively, never jumps)
      const internalRamp =
        easeInQuad(window01(cp, 0, STAGE_IMPACT_START)) * 4.5 +
        easeInCubic(impactWin) * 23.5 +
        this.impactPulseEnv * 4.2;
      targetInternalSpeed = internalRamp * motionCap;

      // External coin-rim orbital wave speed accelerates around the nucleus before each strike
      const cycleAccel = 0.65 + 0.75 * easeInQuad(window01(s.waveCycle, 0.12, 0.60));
      const waveRamp = (2.4 + easeInQuad(cp) * 9.8) * cycleAccel * (cp > 0.001 ? 1 : 0);
      targetWaveOrbitSpeed = waveRamp * motionCap;
      speedLambda = isHolding ? 8.0 : 4.6;

      // Advance wave twist phase while active
      if (cp > 0.001) {
        this.waveTwistPhase += safeDt * (1.2 + chargeRamp * 3.8 + this.impactPulseEnv * 2.5) * motionCap;
      }

      // Tactile camera micro-recoil on each wave impact + subtle gravitational draw-in
      s.cameraZoomOffset = -chargeRamp * 0.10 - this.impactPulseEnv * 0.055 * (reducedMotion ? 0.2 : 1.0);
      s.bloomBoost = chargeRamp * 0.36 + this.impactPulseEnv * 0.38 + s.whiteCoreLevel * 0.45;
    } else {
      // -----------------------------------------------------------------------
      // AUTONOMOUS POST-IGNITION SEQUENCE:
      // WHITE_CORE_STILLNESS -> REVERSE_EXPLOSION -> BLACKOUT -> WELCOME
      // -----------------------------------------------------------------------
      const pt = this.postIgnitionTime;
      s.isAutonomous = true;
      s.chargeProgress = 1;

      if (pt < explosionStart) {
        // STAGE 5: MAXIMUM ENERGY — WHITE CORE & COMPLETE STILLNESS PAUSE
        s.stage = 'WHITE_CORE_STILLNESS';
        const stT = window01(pt, 0, explosionStart);
        s.stageProgress = stT;

        // 0.00..0.28: final violent compression into pure white sphere & brake to dead stop
        // 0.28..1.00: COMPLETE STILLNESS — perfectly still, intensely luminous pure white sphere
        const compressT = easeOutCubic(window01(stT, 0, 0.28));
        const freezeT = easeOutQuart(window01(stT, 0.14, 0.30));

        s.chargingEnergy = 1;
        s.internalCollapse = 1;
        s.internalBlur = 1 - freezeT;
        s.waveActivity = 1 - compressT; // external waves fully absorbed into the white sphere
        s.waveCycle = 0.72;
        s.whiteCoreLevel = 0.72 + compressT * 0.28; // locks cleanly to 1.0 pure white!
        s.motionFreeze = freezeT; // locks cleanly to 1.0 complete stillness!
        s.explosionProgress = 0;
        s.explosionIntensity = 0;
        s.isBlackout = false;
        s.welcomeUiReveal = 0;

        // Slam speeds abruptly to 0.0 so all visible rotation stops dead during stillness pause!
        targetInternalSpeed = stT < 0.18 ? 28.0 * (1 - stT / 0.18) * motionCap : 0;
        targetWaveOrbitSpeed = stT < 0.18 ? 14.0 * (1 - stT / 0.18) * motionCap : 0;
        speedLambda = 28.0;

        if (stT >= 0.28) {
          this.smoothedInternalSpeed = 0;
          this.smoothedWaveOrbitSpeed = 0;
        }

        s.cameraZoomOffset = -0.10 - compressT * 0.06;
        s.bloomBoost = 0.85 + compressT * 0.45;
      } else if (pt < blackoutStart) {
        // STAGE 6: REVERSE ENERGY RELEASE — SUDDEN VIOLENT OUTWARD EXPLOSION (NO FADE-OUT)
        s.stage = 'REVERSE_EXPLOSION';
        const exT = window01(pt, explosionStart, blackoutStart);
        s.stageProgress = exT;

        if (!this.triggeredExplosionHaptic) {
          this.triggeredExplosionHaptic = true;
          this.impactPulseEnv = 1.0;
          this.lastImpactStrength = 1.0;
          this.impactEventId++;
          // Immediate reverse velocity impulse (violent release from stillness!)
          this.smoothedInternalSpeed = -34.0 * motionCap;
          this.smoothedWaveOrbitSpeed = -22.0 * motionCap;
        }

        s.chargingEnergy = 1;
        s.internalCollapse = 1 - easeOutCubic(exT) * 1.35;
        s.internalBlur = 1;
        s.waveActivity = 1;
        s.waveCycle = 0.5;
        // Blinding white-hot blast opening into full theme-colored reverse explosion — stays at PEAK intensity!
        s.whiteCoreLevel = Math.max(0.35, 1 - exT * 0.65);
        s.motionFreeze = 0;
        s.explosionProgress = easeOutCubic(exT);
        // NO gradual fade-out: stays violently bright all the way to the blackout shutter cut!
        s.explosionIntensity = 1.0;
        s.isBlackout = false;
        s.welcomeUiReveal = 0;

        // Rapid reverse-direction rotational velocity!
        targetInternalSpeed = -32.0 * motionCap;
        targetWaveOrbitSpeed = -20.0 * motionCap;
        speedLambda = 22.0;

        this.waveTwistPhase -= safeDt * 18.0 * motionCap;

        // Violent camera pullback punch
        s.cameraZoomOffset = -0.16 + easeOutQuart(exT) * 0.42;
        s.bloomBoost = 1.45;
      } else if (pt < welcomeStart) {
        // STAGE 7: INSTANT DARKNESS — CAMERA SHUTTER CUT (100% PURE BLACK PAUSE)
        s.stage = 'BLACKOUT';
        s.stageProgress = window01(pt, blackoutStart, welcomeStart);

        s.chargingEnergy = 0;
        s.internalCollapse = 0;
        s.internalBlur = 0;
        s.waveActivity = 0;
        s.waveCycle = 0;
        s.whiteCoreLevel = 0;
        s.motionFreeze = 1;
        s.explosionProgress = 0;
        s.explosionIntensity = 0;
        s.isBlackout = true;
        s.welcomeUiReveal = 0; // Strictly 0 during blackout pause!

        targetInternalSpeed = 0;
        targetWaveOrbitSpeed = 0;
        this.smoothedInternalSpeed = 0;
        this.smoothedWaveOrbitSpeed = 0;
        this.impactPulseEnv = 0;

        s.cameraZoomOffset = 0;
        s.bloomBoost = 0;
      } else {
        // STAGE 8: WELCOME SCREEN (Restrained text fade-in ONLY AFTER the blackout pause)
        s.stage = 'WELCOME';
        const wT = window01(pt, welcomeStart, welcomeStart + WELCOME_FADE_DURATION);
        s.stageProgress = wT;

        s.chargingEnergy = 0;
        s.internalCollapse = 0;
        s.internalBlur = 0;
        s.waveActivity = 0;
        s.waveCycle = 0;
        s.whiteCoreLevel = 0;
        s.motionFreeze = 1;
        s.explosionProgress = 0;
        s.explosionIntensity = 0;
        s.isBlackout = true; // Keep WebGL completely dark behind minimal Welcome typography
        s.welcomeUiReveal = easeOutCubic(wT);

        targetInternalSpeed = 0;
        targetWaveOrbitSpeed = 0;
        this.smoothedInternalSpeed = 0;
        this.smoothedWaveOrbitSpeed = 0;
        this.impactPulseEnv = 0;

        s.cameraZoomOffset = 0;
        s.bloomBoost = 0;
      }
    }

    // -------------------------------------------------------------------------
    // 3. VELOCITY & PHASE INTEGRATION (Zero movement when motionFreeze == 1)
    // -------------------------------------------------------------------------
    const damp = 1 - Math.exp(-speedLambda * safeDt);
    if (s.motionFreeze < 0.999) {
      this.smoothedInternalSpeed += (targetInternalSpeed - this.smoothedInternalSpeed) * damp;
      this.smoothedWaveOrbitSpeed += (targetWaveOrbitSpeed - this.smoothedWaveOrbitSpeed) * damp;

      if (Math.abs(this.smoothedInternalSpeed) < 0.0005 && Math.abs(targetInternalSpeed) < 0.0005) {
        this.smoothedInternalSpeed = 0;
      }
      if (Math.abs(this.smoothedWaveOrbitSpeed) < 0.0005 && Math.abs(targetWaveOrbitSpeed) < 0.0005) {
        this.smoothedWaveOrbitSpeed = 0;
      }

      const freezeScale = 1 - s.motionFreeze;
      this.internalSpinPhase += this.smoothedInternalSpeed * safeDt * freezeScale;
      this.waveOrbitPhase += this.smoothedWaveOrbitSpeed * safeDt * freezeScale;
    }

    s.internalAngularSpeed = this.smoothedInternalSpeed;
    s.internalSpinPhase = this.internalSpinPhase;
    s.waveOrbitSpeed = this.smoothedWaveOrbitSpeed;
    s.waveOrbitPhase = this.waveOrbitPhase;
    s.waveTwistPhase = this.waveTwistPhase;
    s.impactPulse = this.impactPulseEnv;
    s.impactStrength = this.lastImpactStrength;
    s.impactEventId = this.impactEventId;

    return s;
  }

  public reset(): void {
    this.chargeProgress = 0;
    this.isAutonomous = false;
    this.postIgnitionTime = 0;
    this.smoothedInternalSpeed = 0;
    this.smoothedWaveOrbitSpeed = 0;
    this.internalSpinPhase = 0;
    this.waveOrbitPhase = 0;
    this.waveTwistPhase = 0;
    this.lastTriggeredBeat = -1;
    this.impactPulseEnv = 0;
    this.lastImpactStrength = 0;
    this.impactEventId = 0;
    this.triggeredWhiteLockHaptic = false;
    this.triggeredExplosionHaptic = false;

    const fresh = createInitialAwakeningSnapshot();
    Object.assign(this.snapshot, fresh);
  }
}
