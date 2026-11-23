/**
 * Tactile multi-axis rotational & two-finger zoom circulation physics controller
 * for the Bird's-Eye 3D Digital Core.
 *
 * Supports:
 * - Single-finger touch drag & mouse drag: natural 3D tilt (softly bounded) + 360° azimuthal spin
 * - Two-finger pinch/spread, two-finger parallel vertical drag, and two-finger twist:
 *   smooth zoom in/out with kinetic helical circulation energy
 * - Desktop mouse wheel & trackpad pinch zoom with matching circulation physics
 * - Zero-jump handoff when transitioning between 1 and 2 fingers
 * - Purely kinetic responsiveness (NO press-and-hold charging or research triggers)
 */
export interface CoreInteractionSnapshot {
  /** Azimuthal spin angle around vertical Y-axis (unbounded radians) */
  spinY: number;
  /** Forward/backward pitch tilt around X-axis (bounded radians) */
  tiltX: number;
  /** Left/right roll tilt around Z-axis (bounded radians) */
  tiltZ: number;
  /** Current azimuthal angular velocity (rad/s) */
  velY: number;
  /** Smoothly damped camera zoom multiplier [0.52 .. 2.55], 1.0 = default framing */
  zoom: number;
  /** Signed circulation intensity [-1 .. +1] (+ = zoom-in inward vortex, - = zoom-out outward spiral) */
  zoomCirculation: number;
  /** Kinetic visual feedback intensity [0..1] derived from rotational & zoom circulation motion */
  kineticEnergy: number;
  /** True while user is actively dragging or pinching */
  isDragging: boolean;
  /** True while two fingers are actively zooming/circulating */
  isPinching: boolean;
  /** True once user has completed at least one rotation or zoom gesture */
  hasInteracted: boolean;
  /** Normalized pointer coordinates relative to viewport center [-1..1] */
  pointerX: number;
  pointerY: number;
  /** Smoothly damped pointer presence [0..1] for subtle touch sheen */
  pointerInfluence: number;
}

interface PointerPoint {
  x: number;
  y: number;
}

const MAX_TILT_RAD = 0.62; // ~35.5° max tilt preserves unmistakable bird's-eye composition
const SPIN_FRICTION = 2.05; // Smooth flywheel deceleration on release
const TILT_VEL_FRICTION = 5.4;
const TILT_SPRING_RETURN = 2.15; // Gentle return to level bird's-eye poise after release
const TILT_SPRING_DAMPING = 3.1;
const MAX_ANGULAR_SPEED = 7.5;

const MIN_ZOOM = 0.52;
const MAX_ZOOM = 2.55;
const ZOOM_FRICTION = 4.2;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function wrapAngleDelta(delta: number): number {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Applies soft asymptotic resistance as tilt approaches MAX_TILT_RAD
 * so the Core feels physically suspended rather than hitting a harsh wall.
 */
function softLimitTilt(value: number, limit: number): number {
  return Math.tanh(value / limit) * limit;
}

export class CoreInteractionController {
  private readonly targetElement: HTMLElement;
  private readonly onFirstInteraction?: () => void;

  private readonly activePointers = new Map<number, PointerPoint>();
  private primaryPointerId: number | null = null;
  private lastClientX = 0;
  private lastClientY = 0;
  private lastMoveTime = 0;
  private cumulativeDragPx = 0;
  private notifiedFirstInteraction = false;

  // Two-finger pinch & drag tracking
  private lastPinchDist = 0;
  private lastPinchAngle = 0;
  private lastPinchMidY = 0;
  private lastZoomTime = 0;

  // Zoom physics (log-space for uniform perceptual speed at every magnification)
  private logZoom = 0; // zoom = Math.exp(logZoom)
  private targetLogZoom = 0;
  private logZoomVel = 0;
  private rawZoomCirc = 0;

  // Raw unbounded tilt accumulators before soft limiting
  private rawTiltX = 0;
  private rawTiltZ = 0;
  private velTiltX = 0;
  private velTiltZ = 0;

  public readonly state: CoreInteractionSnapshot = {
    spinY: 0,
    tiltX: 0,
    tiltZ: 0,
    velY: 0,
    zoom: 1,
    zoomCirculation: 0,
    kineticEnergy: 0,
    isDragging: false,
    isPinching: false,
    hasInteracted: false,
    pointerX: 0,
    pointerY: 0,
    pointerInfluence: 0,
  };

  private readonly boundPointerDown: (e: PointerEvent) => void;
  private readonly boundPointerMove: (e: PointerEvent) => void;
  private readonly boundPointerUp: (e: PointerEvent) => void;
  private readonly boundPointerCancel: (e: PointerEvent) => void;
  private readonly boundWheel: (e: WheelEvent) => void;
  private readonly boundTouchMoveGuard: (e: TouchEvent) => void;

  constructor(targetElement: HTMLElement, onFirstInteraction?: () => void) {
    this.targetElement = targetElement;
    this.onFirstInteraction = onFirstInteraction;

    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundPointerCancel = this.handlePointerCancel.bind(this);
    this.boundWheel = this.handleWheel.bind(this);
    this.boundTouchMoveGuard = this.handleTouchMoveGuard.bind(this);

    targetElement.addEventListener('pointerdown', this.boundPointerDown);
    targetElement.addEventListener('pointermove', this.boundPointerMove);
    targetElement.addEventListener('pointerup', this.boundPointerUp);
    targetElement.addEventListener('pointercancel', this.boundPointerCancel);
    targetElement.addEventListener('lostpointercapture', this.boundPointerCancel);
    targetElement.addEventListener('wheel', this.boundWheel, { passive: false });
    // Passive:false touchmove guard strictly scoped to the Core canvas prevents Android Chrome
    // pull-to-refresh, scroll, and browser-level pinch-zoom while interacting with the 3D Core.
    targetElement.addEventListener('touchmove', this.boundTouchMoveGuard, { passive: false });
  }

  private markInteracted(): void {
    if (!this.notifiedFirstInteraction) {
      this.notifiedFirstInteraction = true;
      this.state.hasInteracted = true;
      this.onFirstInteraction?.();
    }
  }

  private handleTouchMoveGuard(e: TouchEvent): void {
    if (this.activePointers.size > 0 || e.touches.length >= 2) {
      e.preventDefault();
    }
  }

  private updateNormalizedPointer(clientX: number, clientY: number): { nx: number; ny: number; scale: number } {
    const rect = this.targetElement.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const minDim = Math.max(200, Math.min(rect.width, rect.height));
    const nx = clamp((clientX - cx) / (minDim * 0.5), -1.5, 1.5);
    const ny = clamp((clientY - cy) / (minDim * 0.5), -1.5, 1.5);
    this.state.pointerX = clamp(nx, -1, 1);
    this.state.pointerY = clamp(ny, -1, 1);
    return { nx, ny, scale: minDim };
  }

  private getTwoPointerMetrics(): {
    dist: number;
    angle: number;
    midX: number;
    midY: number;
  } | null {
    if (this.activePointers.size < 2) return null;
    const iter = this.activePointers.values();
    const p1 = iter.next().value;
    const p2 = iter.next().value;
    if (!p1 || !p2) return null;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return {
      dist: Math.hypot(dx, dy),
      angle: Math.atan2(dy, dx),
      midX: (p1.x + p2.x) * 0.5,
      midY: (p1.y + p2.y) * 0.5,
    };
  }

  private applyZoomStep(deltaLogZoom: number, dt: number): void {
    if (Math.abs(deltaLogZoom) < 0.0001) return;

    const minLog = Math.log(MIN_ZOOM);
    const maxLog = Math.log(MAX_ZOOM);
    const prevTarget = this.targetLogZoom;
    this.targetLogZoom = clamp(this.targetLogZoom + deltaLogZoom, minLog, maxLog);
    const appliedDelta = this.targetLogZoom - prevTarget;

    // Helical circulation impulse: zooming in swirls forward, zooming out counter-swirls
    const effectiveDelta = Math.abs(appliedDelta) > 0.0001 ? appliedDelta : deltaLogZoom * 0.25;
    const instLogVel = clamp(effectiveDelta / Math.max(0.008, dt), -5.5, 5.5);
    this.logZoomVel = this.logZoomVel * 0.4 + instLogVel * 0.6;

    // Coupled circular orbital spin proportional to zoom movement
    const circSpinDelta = -effectiveDelta * 1.45;
    this.state.spinY += circSpinDelta;
    const instCircSpinVel = clamp(circSpinDelta / Math.max(0.008, dt), -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
    this.state.velY = this.state.velY * 0.55 + instCircSpinVel * 0.45;

    this.rawZoomCirc = clamp(this.rawZoomCirc + effectiveDelta * 4.2, -1.35, 1.35);
    this.lastZoomTime = performance.now();
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    try {
      this.targetElement.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without active pointer capture support
    }

    const now = performance.now();

    if (this.activePointers.size === 1) {
      this.primaryPointerId = e.pointerId;
      this.lastClientX = e.clientX;
      this.lastClientY = e.clientY;
      this.lastMoveTime = now;
      this.cumulativeDragPx = 0;

      this.state.isDragging = true;
      this.state.isPinching = false;
      this.updateNormalizedPointer(e.clientX, e.clientY);

      // Damp existing coasting velocity cleanly when grabbed
      this.state.velY *= 0.25;
      this.velTiltX *= 0.25;
      this.velTiltZ *= 0.25;
    } else if (this.activePointers.size === 2) {
      const metrics = this.getTwoPointerMetrics();
      if (metrics) {
        this.lastPinchDist = Math.max(24, metrics.dist);
        this.lastPinchAngle = metrics.angle;
        this.lastPinchMidY = metrics.midY;
        this.lastMoveTime = now;
        this.lastZoomTime = now;
        this.state.isDragging = true;
        this.state.isPinching = true;
        this.updateNormalizedPointer(metrics.midX, metrics.midY);
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    const tracked = this.activePointers.get(e.pointerId);
    if (!tracked) {
      // Subtle desktop hover tracking without spinning
      if (e.pointerType === 'mouse' && this.activePointers.size === 0) {
        this.updateNormalizedPointer(e.clientX, e.clientY);
      }
      return;
    }

    tracked.x = e.clientX;
    tracked.y = e.clientY;

    const now = performance.now();
    const dt = Math.max(0.004, Math.min(0.05, (now - this.lastMoveTime) / 1000));

    // Two-finger pinch / drag / twist -> Circulation Zoom In & Zoom Out
    if (this.activePointers.size >= 2) {
      const metrics = this.getTwoPointerMetrics();
      if (!metrics) return;

      const safeDist = Math.max(24, metrics.dist);
      const dDist = safeDist - this.lastPinchDist;
      const dMidY = metrics.midY - this.lastPinchMidY;
      const dAngle = wrapAngleDelta(metrics.angle - this.lastPinchAngle);

      const { scale } = this.updateNormalizedPointer(metrics.midX, metrics.midY);

      // 1) Pinch / spread zoom ratio (primary two-finger gesture)
      let deltaLogZoom = Math.log(safeDist / Math.max(24, this.lastPinchDist)) * 1.18;

      // 2) Parallel two-finger vertical drag support (dragging both fingers down zooms in, up zooms out)
      if (Math.abs(dMidY) > 1.2 && Math.abs(dMidY) > Math.abs(dDist) * 1.65) {
        deltaLogZoom += (dMidY / scale) * 2.15;
      }

      this.lastPinchDist = safeDist;
      this.lastPinchAngle = metrics.angle;
      this.lastPinchMidY = metrics.midY;
      this.lastMoveTime = now;

      if (Math.abs(deltaLogZoom) > 0.0015 || Math.abs(dAngle) > 0.003) {
        this.cumulativeDragPx += Math.abs(dDist) + Math.abs(dMidY);
        if (this.cumulativeDragPx > 8) {
          this.markInteracted();
        }
      }

      // Apply zoom + helical circulation impulse
      this.applyZoomStep(deltaLogZoom, dt);

      // 3) Two-finger twist adds direct azimuthal circulation spin
      if (Math.abs(dAngle) > 0.0005 && Math.abs(dAngle) < 0.7) {
        const dSpinTwist = -dAngle * 1.15;
        this.state.spinY += dSpinTwist;
        const instTwistVel = clamp(dSpinTwist / dt, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
        this.state.velY = this.state.velY * 0.5 + instTwistVel * 0.5;
      }
      return;
    }

    // Single-finger / mouse 3D tilt + turntable spin
    if (e.pointerId !== this.primaryPointerId) return;

    const dx = e.clientX - this.lastClientX;
    const dy = e.clientY - this.lastClientY;

    this.lastClientX = e.clientX;
    this.lastClientY = e.clientY;
    this.lastMoveTime = now;

    const moveDist = Math.hypot(dx, dy);
    if (moveDist < 0.05) return;

    this.cumulativeDragPx += moveDist;
    if (this.cumulativeDragPx > 12) {
      this.markInteracted();
    }

    const { nx, ny, scale } = this.updateNormalizedPointer(e.clientX, e.clientY);
    const ndx = dx / scale;
    const ndy = dy / scale;

    // 1) 3D Tilt (bird's-eye top-down mapping: +X drag rolls around -Z, +Y drag pitches around +X)
    const tiltSensitivity = 2.05;
    const dTiltX = ndy * tiltSensitivity;
    const dTiltZ = -ndx * tiltSensitivity;

    this.rawTiltX = clamp(this.rawTiltX + dTiltX, -1.6, 1.6);
    this.rawTiltZ = clamp(this.rawTiltZ + dTiltZ, -1.6, 1.6);

    // 2) Turntable / Azimuthal Spin around vertical Y-axis
    const radialDist = Math.hypot(nx, ny);
    const leverFactor = clamp(radialDist / 0.55, 0.25, 1.25);
    const tangentialCross = (nx * ndy - ny * ndx) / Math.max(radialDist, 0.32);
    const dSpinY = -tangentialCross * 3.1 * leverFactor + ndx * 1.45;

    this.state.spinY += dSpinY;

    // Smoothly track instantaneous velocities for natural release momentum
    const instVelY = clamp(dSpinY / dt, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
    const instVelTiltX = clamp(dTiltX / dt, -4.5, 4.5);
    const instVelTiltZ = clamp(dTiltZ / dt, -4.5, 4.5);

    this.state.velY = this.state.velY * 0.45 + instVelY * 0.55;
    this.velTiltX = this.velTiltX * 0.45 + instVelTiltX * 0.55;
    this.velTiltZ = this.velTiltZ * 0.45 + instVelTiltZ * 0.55;
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? 120 : 1;
    const normDelta = clamp((-e.deltaY * scale) / 360, -0.45, 0.45);
    if (Math.abs(normDelta) < 0.0005) return;

    this.markInteracted();
    this.updateNormalizedPointer(e.clientX, e.clientY);
    this.applyZoomStep(normDelta * 0.58, 0.032);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.activePointers.has(e.pointerId)) return;

    // If finger paused > 90ms before lifting, gently damp release velocity so it feels intentional
    if (this.activePointers.size === 1) {
      const idleBeforeRelease = performance.now() - this.lastMoveTime;
      if (idleBeforeRelease > 90) {
        const decay = Math.exp(-(idleBeforeRelease - 90) * 0.012);
        this.state.velY *= decay;
        this.velTiltX *= decay;
        this.velTiltZ *= decay;
      }
    }

    this.releasePointer(e.pointerId);
  }

  private handlePointerCancel(e: PointerEvent): void {
    if (!this.activePointers.has(e.pointerId)) return;
    this.releasePointer(e.pointerId);
  }

  private releasePointer(pointerId: number): void {
    this.activePointers.delete(pointerId);
    try {
      if (this.targetElement.hasPointerCapture(pointerId)) {
        this.targetElement.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore release errors
    }

    if (this.activePointers.size === 0) {
      this.primaryPointerId = null;
      this.state.isDragging = false;
      this.state.isPinching = false;
    } else if (this.activePointers.size === 1) {
      // Seamless handoff to remaining single finger with zero position jump
      const firstEntry = this.activePointers.entries().next().value;
      if (firstEntry) {
        const [remainId, remainPt] = firstEntry;
        this.primaryPointerId = remainId;
        this.lastClientX = remainPt.x;
        this.lastClientY = remainPt.y;
        this.lastMoveTime = performance.now();
      }
      this.state.isDragging = true;
      this.state.isPinching = false;
    } else {
      const metrics = this.getTwoPointerMetrics();
      if (metrics) {
        this.lastPinchDist = Math.max(24, metrics.dist);
        this.lastPinchAngle = metrics.angle;
        this.lastPinchMidY = metrics.midY;
      }
      this.state.isPinching = true;
    }
  }

  /**
   * Advances rotational momentum, zoom circulation inertia, soft tilt bounds,
   * and equilibrium settling. Call once per frame with clamped delta time (seconds).
   */
  public update(dt: number): CoreInteractionSnapshot {
    const safeDt = Math.min(0.05, Math.max(0.0001, dt));
    const now = performance.now();

    // 1) Rotational momentum & tilt spring return
    if (!this.state.isDragging) {
      // Azimuthal flywheel coasting with exponential deceleration
      this.state.spinY += this.state.velY * safeDt;
      this.state.velY *= Math.exp(-SPIN_FRICTION * safeDt);
      if (Math.abs(this.state.velY) < 0.0008) {
        this.state.velY = 0;
      }

      // Tilt momentum coasting + smooth spring return to poised bird's-eye equilibrium
      const accelX = -TILT_SPRING_RETURN * this.rawTiltX - TILT_SPRING_DAMPING * this.velTiltX;
      const accelZ = -TILT_SPRING_RETURN * this.rawTiltZ - TILT_SPRING_DAMPING * this.velTiltZ;
      this.velTiltX += accelX * safeDt;
      this.velTiltZ += accelZ * safeDt;
      this.velTiltX *= Math.exp(-TILT_VEL_FRICTION * 0.12 * safeDt);
      this.velTiltZ *= Math.exp(-TILT_VEL_FRICTION * 0.12 * safeDt);

      this.rawTiltX += this.velTiltX * safeDt;
      this.rawTiltZ += this.velTiltZ * safeDt;

      if (Math.abs(this.rawTiltX) < 0.0004 && Math.abs(this.velTiltX) < 0.0004) {
        this.rawTiltX = 0;
        this.velTiltX = 0;
      }
      if (Math.abs(this.rawTiltZ) < 0.0004 && Math.abs(this.velTiltZ) < 0.0004) {
        this.rawTiltZ = 0;
        this.velTiltZ = 0;
      }
    } else if (this.state.isPinching) {
      // Gently relax 3D tilt back toward level bird's-eye while zooming
      const pinchTiltRelax = Math.exp(-3.2 * safeDt);
      this.rawTiltX *= pinchTiltRelax;
      this.rawTiltZ *= pinchTiltRelax;
      this.velTiltX *= pinchTiltRelax;
      this.velTiltZ *= pinchTiltRelax;
      if (now - this.lastZoomTime > 50) {
        this.state.velY *= Math.exp(-6.0 * safeDt);
      }
    } else {
      // Decay velocity while dragging if single pointer pauses in place
      const sinceLastMove = now - this.lastMoveTime;
      if (sinceLastMove > 45) {
        const holdDecay = Math.exp(-8.5 * safeDt);
        this.state.velY *= holdDecay;
        this.velTiltX *= holdDecay;
        this.velTiltZ *= holdDecay;
      }
    }

    // 2) Smooth Zoom & Circulation Momentum
    const minLog = Math.log(MIN_ZOOM);
    const maxLog = Math.log(MAX_ZOOM);

    if (!this.state.isPinching && now - this.lastZoomTime > 36) {
      // Coast gently on release for buttery inertia
      if (Math.abs(this.logZoomVel) > 0.002) {
        this.targetLogZoom = clamp(this.targetLogZoom + this.logZoomVel * safeDt * 0.18, minLog, maxLog);
        this.logZoomVel *= Math.exp(-ZOOM_FRICTION * safeDt);
      } else {
        this.logZoomVel = 0;
      }
    }

    const prevLogZoom = this.logZoom;
    const zoomFollow = 1 - Math.exp(-11.5 * safeDt);
    this.logZoom += (this.targetLogZoom - this.logZoom) * zoomFollow;
    this.state.zoom = Math.exp(this.logZoom);

    // Derive signed circulation energy from actual zoom motion + smoothly decaying vortex impulse
    const frameZoomRate = (this.logZoom - prevLogZoom) / safeDt;
    this.rawZoomCirc *= Math.exp(-3.4 * safeDt);
    const targetCirc = clamp(frameZoomRate * 0.52 + this.rawZoomCirc * 0.55, -1, 1);
    const circSmooth = 1 - Math.exp(-9.5 * safeDt);
    this.state.zoomCirculation += (targetCirc - this.state.zoomCirculation) * circSmooth;
    if (Math.abs(this.state.zoomCirculation) < 0.001 && Math.abs(targetCirc) < 0.001) {
      this.state.zoomCirculation = 0;
    }

    // Apply soft bounded tilt so the bird's-eye composition is always preserved
    this.state.tiltX = softLimitTilt(this.rawTiltX, MAX_TILT_RAD);
    this.state.tiltZ = softLimitTilt(this.rawTiltZ, MAX_TILT_RAD);

    // Kinetic feedback responds to rotational velocity & zoom circulation
    const speedMetric =
      Math.abs(this.state.velY) * 0.22 +
      Math.hypot(this.velTiltX, this.velTiltZ) * 0.25 +
      Math.abs(this.state.zoomCirculation) * 0.72;
    const targetKinetic = clamp(speedMetric, 0, 1);
    const kSmooth = 1 - Math.exp(-8.0 * safeDt);
    this.state.kineticEnergy += (targetKinetic - this.state.kineticEnergy) * kSmooth;

    const targetPointerInfluence = this.state.isDragging ? 1 : 0;
    const pSmooth = 1 - Math.exp(-7.5 * safeDt);
    this.state.pointerInfluence += (targetPointerInfluence - this.state.pointerInfluence) * pSmooth;

    return this.state;
  }

  public reset(): void {
    this.rawTiltX = 0;
    this.rawTiltZ = 0;
    this.velTiltX = 0;
    this.velTiltZ = 0;
    this.logZoom = 0;
    this.targetLogZoom = 0;
    this.logZoomVel = 0;
    this.rawZoomCirc = 0;
    this.state.velY = 0;
    this.state.tiltX = 0;
    this.state.tiltZ = 0;
    this.state.zoom = 1;
    this.state.zoomCirculation = 0;
    this.state.kineticEnergy = 0;
  }

  public dispose(): void {
    this.targetElement.removeEventListener('pointerdown', this.boundPointerDown);
    this.targetElement.removeEventListener('pointermove', this.boundPointerMove);
    this.targetElement.removeEventListener('pointerup', this.boundPointerUp);
    this.targetElement.removeEventListener('pointercancel', this.boundPointerCancel);
    this.targetElement.removeEventListener('lostpointercapture', this.boundPointerCancel);
    this.targetElement.removeEventListener('wheel', this.boundWheel);
    this.targetElement.removeEventListener('touchmove', this.boundTouchMoveGuard);
  }
}
