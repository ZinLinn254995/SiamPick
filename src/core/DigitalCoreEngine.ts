import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  createInitialBirthState,
  evaluateBirthChoreography,
  type BirthChoreographyState,
  type CoreLifecyclePhase,
} from './birthTimeline';
import { buildDigitalCore, type DigitalCoreRig, type QualityProfile } from './buildDigitalCore';
import { CoreInteractionController } from './coreInteraction';
import { DEFAULT_CORE_COLOR_THEME, type CoreColorTheme } from './coreTheme';

export interface DigitalCoreEngineCallbacks {
  initialTheme?: CoreColorTheme;
  onPhaseChange?: (phase: CoreLifecyclePhase) => void;
  onFirstInteraction?: () => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

const RIBBON_ORBIT_PARAMS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0.92, 0.38, 0.36, 0.28, -0.21],
  [-0.78, 0.86, -0.31, 0.24, 0.27],
  [0.56, -1.04, 0.25, -0.29, -0.24],
];

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const rendererName = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererName);
  } catch {
    return true;
  }
}

function detectQualityProfile(isSoftwareGl: boolean): QualityProfile {
  const isTouchCoarse =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)').matches;
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 768;
  const lowCores =
    typeof navigator !== 'undefined' &&
    typeof navigator.hardwareConcurrency === 'number' &&
    navigator.hardwareConcurrency <= 4;
  const isMobile = Boolean(isTouchCoarse || isNarrow);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const pixelRatio = isSoftwareGl
    ? 1
    : isMobile || lowCores
      ? Math.min(dpr, 1.5)
      : Math.min(dpr, 2);

  return {
    isSoftwareGl,
    isMobile,
    particleCount: isMobile || lowCores ? 240 : 420,
    sphereDetail: isMobile ? 4 : 5,
    torusSegments: isMobile ? 72 : 96,
    pixelRatio,
    // Skip multi-pass bloom on software WebGL (additive halos keep visual richness)
    useBloom: !isSoftwareGl,
    bloomScale: isMobile ? 0.38 : 0.5,
  };
}

/**
 * Real-time Three.js engine managing the SiamPick 3D Digital Intelligence Core.
 * - True bird's-eye top-down PerspectiveCamera with responsive mobile/desktop framing
 * - Stage 01 Birth choreography -> automatic Stage 02 living Normal / Idle state
 * - Tactile touch & mouse rotation with differential ring inertia
 * - Adaptive mobile GPU quality + software-WebGL afterDraw pacing + full GPU cleanup
 */
export class DigitalCoreEngine {
  private readonly container: HTMLElement;
  private readonly callbacks: DigitalCoreEngineCallbacks;
  private readonly quality: QualityProfile;
  private readonly reducedMotion: boolean;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly envTexture: THREE.Texture;
  private readonly rig: DigitalCoreRig;
  private readonly interaction: CoreInteractionController;

  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private readonly birthState: BirthChoreographyState = createInitialBirthState();
  private lastReportedPhase: CoreLifecyclePhase = 'birth';
  private activeTheme: CoreColorTheme;
  private readonly scratchBackdrop = new THREE.Color();

  private rafOrTimerId = 0;
  private lastFrameTimestamp = 0;
  private elapsedTime = 0;
  private birthElapsed = 0;
  private isDisposed = false;
  private isPaused = false;
  private isContextLost = false;

  // Differential inertia followers for concentric rings (gives physical mechanical coupling)
  private ringSpinLag: [number, number, number, number] = [0, 0, 0, 0];
  private smoothedTiltX = 0;
  private smoothedTiltZ = 0;
  private baseCameraHeight = 12.5;
  private smoothedCameraHeight = 12.5;
  private circulationPhase = 0;

  private readonly boundResize: () => void;
  private readonly boundVisibility: () => void;
  private readonly boundContextLost: (e: Event) => void;
  private readonly boundContextRestored: () => void;
  private readonly resizeObserver: ResizeObserver | null;

  constructor(container: HTMLElement, callbacks: DigitalCoreEngineCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    this.reducedMotion =
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

    this.activeTheme = callbacks.initialTheme
      ? { ...callbacks.initialTheme }
      : { ...DEFAULT_CORE_COLOR_THEME };

    const isSoftwareGl = detectSoftwareWebGL();
    this.quality = detectQualityProfile(isSoftwareGl);

    // 1. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.scratchBackdrop.set(this.activeTheme.backdropHex);
    this.renderer.setClearColor(this.scratchBackdrop, 1);

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
    container.appendChild(canvas);

    // 2. Scene & Studio RoomEnvironment Reflections
    this.scene = new THREE.Scene();
    this.scene.background = this.scratchBackdrop.clone();
    this.scene.fog = new THREE.FogExp2(this.scratchBackdrop.getHex(), 0.028);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envTexture = pmrem.fromScene(roomEnv, 0.04).texture;
    this.scene.environment = this.envTexture;
    roomEnv.dispose();
    pmrem.dispose();

    // 3. True Bird's-Eye Top-Down Camera (directly above looking straight down -Y)
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 95);
    // Align camera.up to -Z so screen +X = world +X and screen +Y(down) = world +Z, zero gimbal lock
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(0, 12.5, 0);
    this.camera.lookAt(0, 0, 0);

    // 4. Build Composite 3D Digital Core
    this.rig = buildDigitalCore(this.scene, this.quality, this.activeTheme);

    // 5. Post-Processing Bloom (GPU only, adaptive resolution for smooth Android 60fps)
    if (this.quality.useBloom) {
      const w = Math.max(1, container.clientWidth || window.innerWidth);
      const h = Math.max(1, container.clientHeight || window.innerHeight);
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(
          Math.max(64, Math.floor(w * this.quality.bloomScale)),
          Math.max(64, Math.floor(h * this.quality.bloomScale))
        ),
        this.activeTheme.bloom,
        0.46,
        0.44
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }

    // 6. Touch & Mouse Interaction Controller
    this.interaction = new CoreInteractionController(canvas, () => {
      this.callbacks.onFirstInteraction?.();
    });

    // 7. Initial Responsive Framing & Shader Pre-warm
    this.updateSize();
    if (!this.quality.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 8. Lifecycle & Resize Listeners
    this.boundResize = this.updateSize.bind(this);
    this.boundVisibility = this.handleVisibilityChange.bind(this);
    this.boundContextLost = this.handleContextLost.bind(this);
    this.boundContextRestored = this.handleContextRestored.bind(this);

    window.addEventListener('resize', this.boundResize);
    window.addEventListener('orientationchange', this.boundResize);
    document.addEventListener('visibilitychange', this.boundVisibility);
    canvas.addEventListener('webglcontextlost', this.boundContextLost);
    canvas.addEventListener('webglcontextrestored', this.boundContextRestored);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.boundResize);
      this.resizeObserver.observe(container);
    } else {
      this.resizeObserver = null;
    }

    // Start animation loop
    this.lastFrameTimestamp = performance.now();
    this.scheduleNextFrame();
  }

  public replayBirth(): void {
    this.birthElapsed = 0;
    this.lastReportedPhase = 'birth';
    this.circulationPhase = 0;
    this.interaction.reset();
    this.callbacks.onPhaseChange?.('birth');
  }

  public setColorTheme(theme: CoreColorTheme): void {
    if (this.isDisposed) return;
    this.activeTheme = { ...theme };
    this.rig.applyColorTheme(this.activeTheme);
    this.scratchBackdrop.set(this.activeTheme.backdropHex);
    this.renderer.setClearColor(this.scratchBackdrop, 1);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.scratchBackdrop);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.scratchBackdrop);
    }
  }

  private updateSize(): void {
    if (this.isDisposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    const aspect = width / height;

    this.camera.aspect = aspect;

    // Fit the full concentric Core diameter (~7.8 world units including glow & particles)
    // comfortably on both portrait Android screens and landscape desktop screens.
    const coreVisibleRadius = 4.45;
    const vFovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const tanHalfV = Math.tan(vFovRad * 0.5);
    const tanHalfH = tanHalfV * aspect;

    const distForHeight = coreVisibleRadius / tanHalfV;
    const distForWidth = coreVisibleRadius / Math.max(0.28, tanHalfH);
    const targetHeight = Math.max(distForHeight, distForWidth) * (aspect < 0.85 ? 1.04 : 1.08);
    this.baseCameraHeight = THREE.MathUtils.clamp(targetHeight, 9.2, 23.5);
    const activeZoom = this.interaction ? this.interaction.state.zoom : 1;
    this.smoothedCameraHeight = THREE.MathUtils.clamp(this.baseCameraHeight / activeZoom, 3.4, 38.0);

    this.camera.position.set(0, this.smoothedCameraHeight, 0);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    const dpr = this.quality.isSoftwareGl
      ? 1
      : this.quality.isMobile
        ? Math.min(window.devicePixelRatio || 1, 1.5)
        : Math.min(window.devicePixelRatio || 1, 2);

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.rig.particlesPoints.material.uniforms.uPixelRatio.value = dpr;

    if (this.composer && this.bloomPass) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(width, height);
      this.bloomPass.resolution.set(
        Math.max(64, Math.floor(width * this.quality.bloomScale)),
        Math.max(64, Math.floor(height * this.quality.bloomScale))
      );
    }
  }

  private handleVisibilityChange(): void {
    if (this.isDisposed) return;
    if (document.hidden) {
      this.isPaused = true;
      this.cancelScheduledFrame();
    } else {
      this.isPaused = false;
      this.lastFrameTimestamp = performance.now();
      this.scheduleNextFrame();
    }
  }

  private handleContextLost(e: Event): void {
    e.preventDefault();
    this.isContextLost = true;
    this.cancelScheduledFrame();
    this.callbacks.onContextLost?.();
  }

  private handleContextRestored(): void {
    this.isContextLost = false;
    this.lastFrameTimestamp = performance.now();
    this.callbacks.onContextRestored?.();
    this.scheduleNextFrame();
  }

  private cancelScheduledFrame(): void {
    if (this.rafOrTimerId) {
      cancelAnimationFrame(this.rafOrTimerId);
      window.clearTimeout(this.rafOrTimerId);
      this.rafOrTimerId = 0;
    }
  }

  /**
   * Software WebGL fence-sync pacing per Three.js guidelines so headless/software
   * environments never starve the main thread.
   */
  private afterSoftwareDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.isDisposed || this.isPaused || this.isContextLost) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.rafOrTimerId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.rafOrTimerId = window.setTimeout(cb, 80);
        }
      };
      this.rafOrTimerId = window.setTimeout(poll, 5);
    } else {
      this.rafOrTimerId = window.setTimeout(cb, 80);
    }
  }

  private scheduleNextFrame(): void {
    if (this.isDisposed || this.isPaused || this.isContextLost) return;
    if (this.quality.isSoftwareGl) {
      this.afterSoftwareDraw(() => this.tick());
    } else {
      this.rafOrTimerId = requestAnimationFrame(() => this.tick());
    }
  }

  private tick(): void {
    if (this.isDisposed || this.isPaused || this.isContextLost) return;

    const now = performance.now();
    const rawDt = (now - this.lastFrameTimestamp) / 1000;
    this.lastFrameTimestamp = now;
    // Clamp delta to prevent jumps on tab switch or frame hiccups
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    this.elapsedTime += dt;
    this.birthElapsed += dt;

    // 1. Evaluate Stage 01 Birth -> Stage 02 Normal State choreography
    const birth = evaluateBirthChoreography(this.birthElapsed, this.reducedMotion, this.birthState);
    if (birth.phase !== this.lastReportedPhase) {
      this.lastReportedPhase = birth.phase;
      this.callbacks.onPhaseChange?.(birth.phase);
    }

    // 2. Evaluate Touch, Pinch-Zoom & Mouse Rotational Physics
    const input = this.interaction.update(dt);

    // 3. Living Dual-Harmonic Idle Pulse & Helical Zoom Circulation Phase
    const motionScale = this.reducedMotion ? 0.25 : 1.0;
    const t = this.elapsedTime;
    const pulse =
      (Math.sin(t * 1.25) * 0.5 + 0.5) * 0.65 +
      (Math.sin(t * 0.53 + 1.1) * 0.5 + 0.5) * 0.35;

    // Smooth camera zoom elevation + adaptive fog clarity at all zoom depths
    const targetCamY = THREE.MathUtils.clamp(this.baseCameraHeight / input.zoom, 3.4, 38.0);
    this.smoothedCameraHeight = THREE.MathUtils.damp(this.smoothedCameraHeight, targetCamY, 10.5, dt);
    this.camera.position.y = this.smoothedCameraHeight;
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = THREE.MathUtils.clamp(
        0.025 * (this.baseCameraHeight / Math.max(4.0, this.smoothedCameraHeight)),
        0.009,
        0.032
      );
    }

    // Continuous vortex phase (monotonically advances on zoom-in, reverses on zoom-out, zero jump on stop)
    this.circulationPhase += dt * input.zoomCirculation * 3.4 * motionScale;
    const circPhase = this.circulationPhase;
    const circIntensity = input.zoomCirculation;
    const depthSpread = THREE.MathUtils.clamp(1.0 + (input.zoom - 1.0) * 0.42, 0.78, 1.65);

    // 4. Apply Bird's-Eye Preserving 3D Tilt + Ambient Micro-Drift + Azimuthal Spin
    const idleDriftX = Math.sin(t * 0.36) * 0.042 * birth.idleBlend * motionScale;
    const idleDriftZ = Math.cos(t * 0.29) * 0.042 * birth.idleBlend * motionScale;

    const targetTiltX = input.tiltX + idleDriftX;
    const targetTiltZ = input.tiltZ + idleDriftZ;
    this.smoothedTiltX = THREE.MathUtils.damp(this.smoothedTiltX, targetTiltX, 12, dt);
    this.smoothedTiltZ = THREE.MathUtils.damp(this.smoothedTiltZ, targetTiltZ, 12, dt);

    this.rig.rootGroup.rotation.set(this.smoothedTiltX, 0, this.smoothedTiltZ);

    // Differential inertial coupling: inner core follows drag crisply, outer rings lag slightly for physical mass
    const lagRates: [number, number, number, number] = [14.0, 9.5, 6.8, 4.6];
    for (let i = 0; i < 4; i++) {
      this.ringSpinLag[i] = THREE.MathUtils.damp(this.ringSpinLag[i], input.spinY, lagRates[i], dt);
    }

    // Central Core & Crystalline Containment Rotation
    const coreScale = Math.max(0.001, 0.16 + birth.coreMaterialize * 0.84);
    this.rig.centralCoreGroup.scale.setScalar(coreScale);
    this.rig.centralCoreGroup.rotation.y = this.ringSpinLag[0] + t * 0.18 * motionScale + circPhase * 0.62;

    this.rig.crystalCageGroup.rotation.x = t * 0.22 * motionScale + this.smoothedTiltX * 0.35;
    this.rig.crystalCageGroup.rotation.y = -t * 0.31 * motionScale + this.ringSpinLag[0] * 0.35 - circPhase * 0.78;
    this.rig.crystalCageGroup.rotation.z = Math.sin(t * 0.4) * 0.22 * motionScale;

    this.rig.crystalShellMat.opacity = birth.coreMaterialize * (0.28 + input.kineticEnergy * 0.12);
    this.rig.crystalShellMat.emissiveIntensity = 0.28 + pulse * 0.2 + input.kineticEnergy * 0.38;
    this.rig.crystalWireMat.opacity = birth.coreMaterialize * (0.52 + pulse * 0.18 + input.kineticEnergy * 0.3);

    // Interlocking 3D Luminous Energy Ribbons & Inner Harmonic Crown
    const ribbonScale = Math.max(0.001, (0.58 + birth.apertureUnfold * 0.42) * (1 + Math.abs(circIntensity) * 0.06));
    this.rig.energyRibbonsGroup.scale.setScalar(ribbonScale);
    this.rig.energyRibbonsGroup.rotation.y = this.ringSpinLag[0] * 0.45 + circPhase * 0.85;

    const ribbonMotion = t * motionScale;
    const kineticSpin = input.kineticEnergy * 0.35;
    for (let i = 0; i < 3; i++) {
      const ribbon = this.rig.ribbonMeshes[i];
      const [baseX, baseZ, speedY, wobbleX, wobbleZ] = RIBBON_ORBIT_PARAMS[i];
      const ribbonCircDir = i % 2 === 0 ? 1 : -1;
      ribbon.rotation.set(
        baseX + Math.sin(ribbonMotion * wobbleX + circPhase * 0.55 + i * 2.1) * 0.28 + this.smoothedTiltX * 0.22,
        ribbonMotion * (speedY + ribbonCircDir * kineticSpin) + circPhase * 0.95 * ribbonCircDir + i * 1.05,
        baseZ + Math.cos(ribbonMotion * wobbleZ - circPhase * 0.45 + i * 1.7) * 0.26 + this.smoothedTiltZ * 0.22
      );
      const rU = ribbon.material.uniforms;
      rU.uTime.value = t;
      rU.uUnfold.value = birth.apertureUnfold;
      rU.uPulse.value = pulse;
      rU.uKinetic.value = input.kineticEnergy;
      rU.uCircPhase.value = circPhase;
      rU.uCircIntensity.value = circIntensity;
    }

    const crownU = this.rig.innerCrownMat.uniforms;
    crownU.uTime.value = t;
    crownU.uReveal.value = birth.apertureUnfold;
    crownU.uPulse.value = pulse;
    crownU.uKinetic.value = input.kineticEnergy;
    crownU.uCircPhase.value = circPhase;
    crownU.uCircIntensity.value = circIntensity;

    // Update Central Plasma Shader Uniforms
    const plasmaU = this.rig.plasmaMesh.material.uniforms;
    plasmaU.uTime.value = t;
    plasmaU.uPulse.value = pulse;
    plasmaU.uKinetic.value = input.kineticEnergy;
    plasmaU.uMaterialize.value = birth.coreMaterialize;
    plasmaU.uSurge.value = birth.ignitionSurge;

    // Update Equatorial Singularity Spark & Volumetric Halo
    const haloU = this.rig.haloMesh.material.uniforms;
    haloU.uTime.value = t;
    haloU.uSingularity.value = birth.singularityPoint;
    haloU.uMaterialize.value = birth.coreMaterialize;
    haloU.uPulse.value = pulse;
    haloU.uSurge.value = birth.ignitionSurge;
    haloU.uKinetic.value = input.kineticEnergy;
    haloU.uOutwardWave.value = birth.outwardWave;
    haloU.uCircPhase.value = circPhase;
    haloU.uCircIntensity.value = circIntensity;

    // Update Circuit Lattice & Physical Radial Conduits
    this.rig.circuitGroup.rotation.y = this.ringSpinLag[1] - t * 0.032 * motionScale - circPhase * 0.42;
    const circuitU = this.rig.circuitDiscMat.uniforms;
    circuitU.uTime.value = t;
    circuitU.uReveal.value = birth.circuitReveal;
    circuitU.uOutwardWave.value = birth.outwardWave;
    circuitU.uPulse.value = pulse;
    circuitU.uKinetic.value = input.kineticEnergy;
    circuitU.uCircPhase.value = circPhase;
    circuitU.uCircIntensity.value = circIntensity;
    // Transform viewport pointer into rotating circuit disc local XY plane
    const discAngle = this.rig.circuitGroup.rotation.y;
    const cosA = Math.cos(discAngle);
    const sinA = Math.sin(discAngle);
    const px = input.pointerX * 0.85;
    const pz = input.pointerY * 0.85;
    circuitU.uPointerLocal.value.set(
      px * cosA - pz * sinA,
      -(px * sinA + pz * cosA)
    );
    circuitU.uPointerInfluence.value = input.pointerInfluence * birth.circuitReveal;

    this.rig.conduitStripMat.opacity = birth.circuitReveal * 0.92;
    this.rig.conduitStripMat.emissiveIntensity =
      (0.75 + pulse * 0.45 + input.kineticEnergy * 0.9 + birth.ignitionSurge * 0.65) *
      birth.circuitReveal;

    // Update Shared Metallic Ring Opacity & Reflections
    const metalFade = birth.ringReveal[0] * 0.35 + birth.ringReveal[1] * 0.65;
    for (let i = 0; i < this.rig.ringMetalMats.length; i++) {
      this.rig.ringMetalMats[i].opacity = metalFade;
    }
    this.rig.statorChannelMat.opacity = birth.ringReveal[1];
    this.rig.statorChannelMat.emissiveIntensity =
      (1.0 + pulse * 0.5 + input.kineticEnergy * 0.85 + birth.ignitionSurge * 0.6) *
      birth.ringReveal[1];

    // Counter-Rotating Concentric Ring Tiers (staggered speeds + differential helical circulation + 3D zoom parallax)
    const idleRingSpeeds: [number, number, number, number] = [0.16, -0.085, 0.115, -0.048];
    const circRingMultipliers: [number, number, number, number] = [1.18, -0.82, 0.96, -0.64];
    const restHeights: [number, number, number, number] = [0.18, 0.0, 0.30, -0.22];

    for (let i = 0; i < 4; i++) {
      const reveal = birth.ringReveal[i];
      const group = this.rig.ringGroups[i];
      group.rotation.y =
        this.ringSpinLag[i] +
        t * idleRingSpeeds[i] * motionScale +
        circPhase * circRingMultipliers[i];

      // Subtle vertical elevation lock-in during birth + calm floating resonance + 3D depth parallax on zoom
      const birthLift = (1 - reveal) * (i % 2 === 0 ? 0.55 : -0.45);
      const idleFloat = Math.sin(t * (0.7 + i * 0.22) + i * 1.4) * 0.025 * birth.idleBlend * motionScale;
      const circParallaxWave = circIntensity * (i % 2 === 0 ? 0.1 : -0.1);
      group.position.y = restHeights[i] * depthSpread + birthLift + idleFloat + circParallaxWave;

      const s = 0.86 + reveal * 0.14;
      group.scale.set(s, 1, s);

      const u = this.rig.ringShaderMats[i].uniforms;
      u.uTime.value = t;
      u.uReveal.value = reveal;
      u.uPulse.value = pulse;
      u.uKinetic.value = input.kineticEnergy;
      u.uCircPhase.value = circPhase * (i % 2 === 0 ? 1 : -1);
      u.uCircIntensity.value = circIntensity;
    }

    // Update Twin Luminous Harmonic Optical Filaments on Tier 0
    for (let i = 0; i < 2; i++) {
      const fU = this.rig.innerFilamentMats[i].uniforms;
      fU.uTime.value = t;
      fU.uReveal.value = birth.ringReveal[0];
      fU.uPulse.value = pulse;
      fU.uKinetic.value = input.kineticEnergy;
      fU.uCircPhase.value = circPhase * (i === 0 ? 1 : -1);
      fU.uCircIntensity.value = circIntensity;
    }

    // Update Instanced Floating Focal Prisms & Stator Capacitor Nodes
    this.rig.updateInstancedParts(
      t + circPhase * 0.5,
      birth.apertureUnfold,
      pulse,
      input.kineticEnergy,
      birth.ringReveal[1]
    );

    // Update Converging Birth Filaments -> Subtle Idle Circulation Streams
    const convU = this.rig.convergeLinesMat.uniforms;
    convU.uTime.value = t + circPhase * 0.55;
    convU.uVisibility.value = birth.convergeLines;
    convU.uFlow.value = birth.convergeFlow;
    convU.uIdleBlend.value = birth.idleBlend;
    convU.uKinetic.value = input.kineticEnergy;

    // Update GPU-Driven Circulating Particles
    this.rig.particlesPoints.rotation.y = this.ringSpinLag[2] * 0.65;
    const partU = this.rig.particlesPoints.material.uniforms;
    partU.uTime.value = t;
    partU.uVisibility.value = birth.particleVisibility;
    partU.uGather.value = birth.particleGather;
    partU.uKinetic.value = input.kineticEnergy;
    partU.uPulse.value = pulse;
    partU.uOutwardWave.value = birth.outwardWave;
    partU.uCircPhase.value = circPhase;
    partU.uCircIntensity.value = circIntensity;

    // Update Deep Radial Substrate Grid
    const subU = this.rig.substrateMat.uniforms;
    subU.uTime.value = t;
    subU.uReveal.value = birth.substrateReveal;
    subU.uPulse.value = pulse;

    // Dynamic Core Lighting Intensity
    this.rig.corePointLight.intensity =
      (birth.singularityPoint * 1.8 + birth.coreMaterialize * 2.8) *
      (0.88 + pulse * 0.22 + input.kineticEnergy * 0.45 + birth.ignitionSurge * 0.55);
    this.rig.rimVioletLight.intensity =
      birth.circuitReveal * (1.55 + Math.cos(t * 0.9) * 0.25 + input.kineticEnergy * 0.35);

    // Dynamic Bloom breathing on real GPUs scaled by user's live bloom setting
    if (this.bloomPass) {
      const baseStrength = this.activeTheme.bloom;
      const scale = baseStrength > 0.01 ? 1 : 0;
      this.bloomPass.strength =
        baseStrength + scale * (birth.ignitionSurge * 0.24 + pulse * 0.06 + input.kineticEnergy * 0.14);
    }

    // 5. Render Frame
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    this.scheduleNextFrame();
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.cancelScheduledFrame();

    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('orientationchange', this.boundResize);
    document.removeEventListener('visibilitychange', this.boundVisibility);
    this.resizeObserver?.disconnect();

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.boundContextLost);
    canvas.removeEventListener('webglcontextrestored', this.boundContextRestored);

    this.interaction.dispose();

    // Dispose all geometries, materials, and textures cleanly to avoid GPU memory leaks
    const disposedGeoms = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();

    this.scene.traverse((obj) => {
      const renderable = obj as THREE.Mesh | THREE.LineSegments | THREE.Points;
      if (renderable.geometry && !disposedGeoms.has(renderable.geometry)) {
        disposedGeoms.add(renderable.geometry);
        renderable.geometry.dispose();
      }
      const mat = renderable.material;
      if (Array.isArray(mat)) {
        for (const m of mat) {
          if (!disposedMats.has(m)) {
            disposedMats.add(m);
            m.dispose();
          }
        }
      } else if (mat && !disposedMats.has(mat)) {
        disposedMats.add(mat);
        mat.dispose();
      }
    });

    this.envTexture.dispose();
    this.composer?.dispose();
    this.renderer.dispose();

    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
