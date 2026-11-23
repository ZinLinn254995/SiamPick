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
import {
  buildFloatingEcommerceIcons,
  type FloatingEcommerceIconsSystem,
} from './buildFloatingEcommerceIcons';
import { CoreInteractionController } from './coreInteraction';
import { DEFAULT_CORE_COLOR_THEME, type CoreColorTheme } from './coreTheme';
import { computeRankOrbSlots } from './radarOrbsRenderer';

export type ResearchHoldStatus =
  | 'hidden'
  | 'researching'
  | 'complete'
  | 'rolling_back'
  | 'launching';

export interface ResearchProgressSnapshot {
  status: ResearchHoldStatus;
  progress: number;
  percent: number;
}

export interface CorePortalHandoff {
  /** Exact live outer radius of the 3D Main Core on screen in CSS pixels at the instant of handoff */
  coreRadiusPx: number;
  /** Signed rotational angular velocity carried out of the Main Core */
  spinVelocity: number;
}

export interface DigitalCoreEngineCallbacks {
  initialTheme?: CoreColorTheme;
  initialDynamicColor?: boolean;
  onPhaseChange?: (phase: CoreLifecyclePhase) => void;
  onFirstInteraction?: () => void;
  onWhitePortalProgress?: (progress: number) => void;
  onWhitePortalChange?: (isOpen: boolean, handoff?: CorePortalHandoff) => void;
  onResearchProgressBar?: (progress: number) => void;
  onResearchStateChange?: (snapshot: ResearchProgressSnapshot) => void;
  onLiveColorChange?: (primaryHex: string, accentHex: string) => void;
  getProgressClearanceBottomPx?: () => number;
  onColorThemeCommit?: (theme: CoreColorTheme) => void;
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
  private readonly floatingIcons: FloatingEcommerceIconsSystem;
  private readonly interaction: CoreInteractionController;

  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private readonly birthState: BirthChoreographyState = createInitialBirthState();
  private lastReportedPhase: CoreLifecyclePhase = 'birth';
  private activeTheme: CoreColorTheme;
  private readonly scratchBackdrop = new THREE.Color();

  // Dynamic gesture-driven color morphing state (zero per-frame GC allocations)
  private dynamicColorEnabled = true;
  private dynamicColorDirty = false;
  private colorAnchorSpinY = 0;
  private colorAnchorLogZoom = 0;
  private smoothedColorSpinDelta = 0;
  private smoothedColorZoomDelta = 0;
  private smoothedColorTiltDelta = 0;
  private lastAppliedColorSignature = Number.NaN;
  private readonly baseDeepColor = new THREE.Color();
  private readonly basePrimaryColor = new THREE.Color();
  private readonly baseAccentColor = new THREE.Color();
  private readonly baseBackdropColor = new THREE.Color();
  private readonly liveDeepColor = new THREE.Color();
  private readonly livePrimaryColor = new THREE.Color();
  private readonly liveAccentColor = new THREE.Color();
  private readonly liveBackdropColor = new THREE.Color();
  private readonly hslScratch = { h: 0, s: 0, l: 0 };
  private lastEmittedPrimaryHex = '';
  private lastEmittedAccentHex = '';

  private rafOrTimerId = 0;
  private lastFrameTimestamp = 0;
  private elapsedTime = 0;
  private birthElapsed = 0;
  private isDisposed = false;
  private isPaused = false;
  private isContextLost = false;

  // Differential fluid-shell inertia & real-time rotational liquid physics (zero GC allocations)
  private ringSpinLag: [number, number, number, number] = [0, 0, 0, 0];
  private ringSpinAngVel: [number, number, number, number] = [0, 0, 0, 0];
  private ringPressLag: [number, number, number, number] = [0, 0, 0, 0];
  private ringTurboPhase: [number, number, number, number] = [0, 0, 0, 0];
  private fluidSpinVel = 0;
  private prevFluidSpinVel = 0;
  private fluidCentrifugal = 0;
  private fluidCentrifugalVel = 0;
  private fluidSloshEnergy = 0;
  private fluidSloshX = 0;
  private fluidSloshZ = 0;
  private fluidSloshVelX = 0;
  private fluidSloshVelZ = 0;
  private prevPressDepth = 0;
  private smoothedTiltX = 0;
  private smoothedTiltZ = 0;
  private baseCameraHeight = 12.5;
  private smoothedCameraHeight = 12.5;
  private circulationPhase = 0;
  private turboSpinPhase = 0;
  private whitePortalOpen = false;
  private whitePortalVisual = 0;
  private lastReportedPortalVisual = -1;
  private coreDrainElapsed = 0;
  private frozenReleaseScale = 1;
  private coreRebirthFade = 1;
  private morphSpinDir = 1;
  private readonly orbWorldTargets: Array<{
    x: number;
    z: number;
    radius: number;
    halfW: number;
    halfH: number;
  }> = Array.from({ length: 8 }, () => ({ x: 0, z: 0, radius: 0.45, halfW: 0.75, halfH: 0.95 }));
  private wasHoldingCollapse = false;
  private peakHoldCollapse = 0;
  private peakHoldSpin = 0;

  // Live long-press Researching Progress & post-burst portal launch state
  private researchStatus: ResearchHoldStatus = 'hidden';
  private researchProgress = 0;
  private rollbackStartProgress = 0;
  private zeroHoldRemaining = 0;
  private burstPortalActive = false;
  private burstPortalElapsed = 0;
  private lastEmittedResearchStatus: ResearchHoldStatus = 'hidden';
  private lastEmittedResearchPercent = -1;
  private lastEmittedBarProgress = -1;

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
    this.dynamicColorEnabled = callbacks.initialDynamicColor ?? true;
    this.syncBaseColorsFromTheme(this.activeTheme);

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

    // 4. Build Composite 3D Digital Core + Embedded Orbital E-Commerce Icon Rotation Layers
    this.rig = buildDigitalCore(this.scene, this.quality, this.activeTheme);
    this.floatingIcons = buildFloatingEcommerceIcons(this.scene, this.rig.rootGroup, this.quality);
    this.floatingIcons.syncColors(
      this.liveDeepColor,
      this.livePrimaryColor,
      this.liveAccentColor,
      this.activeTheme.saturation
    );
    this.emitLiveColors(true);

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
    this.turboSpinPhase = 0;
    this.ringSpinLag = [0, 0, 0, 0];
    this.ringSpinAngVel = [0, 0, 0, 0];
    this.ringPressLag = [0, 0, 0, 0];
    this.ringTurboPhase = [0, 0, 0, 0];
    this.fluidSpinVel = 0;
    this.prevFluidSpinVel = 0;
    this.fluidCentrifugal = 0;
    this.fluidCentrifugalVel = 0;
    this.fluidSloshEnergy = 0;
    this.fluidSloshX = 0;
    this.fluidSloshZ = 0;
    this.fluidSloshVelX = 0;
    this.fluidSloshVelZ = 0;
    this.prevPressDepth = 0;
    this.whitePortalOpen = false;
    this.whitePortalVisual = 0;
    this.lastReportedPortalVisual = -1;
    this.coreDrainElapsed = 0;
    this.frozenReleaseScale = 1;
    this.coreRebirthFade = 1;
    for (let i = 0; i < this.rig.liquidEdgeRibbons.length; i++) {
      const u = this.rig.liquidEdgeRibbons[i].mat.uniforms;
      u.uMorphT.value = 0;
      u.uMorphFade.value = 1;
    }
    this.wasHoldingCollapse = false;
    this.peakHoldCollapse = 0;
    this.peakHoldSpin = 0;
    this.resetResearchState();
    this.interaction.reset();
    this.reanchorDynamicColor();
    this.callbacks.onWhitePortalProgress?.(0);
    this.callbacks.onWhitePortalChange?.(false);
    this.callbacks.onPhaseChange?.('birth');
  }

  private resetResearchState(): void {
    this.researchStatus = 'hidden';
    this.researchProgress = 0;
    this.rollbackStartProgress = 0;
    this.zeroHoldRemaining = 0;
    this.burstPortalActive = false;
    this.burstPortalElapsed = 0;
    this.emitResearchTelemetry(true);
  }

  /**
   * Projects the live 3D Core outer visual radius onto viewport CSS pixels so both
   * spatial clearance detection and continuous Core-to-Orb light rivers anchor
   * onto the exact live perimeter of the spinning Main Core.
   */
  private computeCoreProjectedRadiusPx(finalScaleXZ: number, rootPosY: number): number {
    const heightPx = this.container.clientHeight || window.innerHeight || 1;
    const distToCore = Math.max(0.5, this.camera.position.y - rootPosY);
    const halfFrustumWorld =
      distToCore * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    const coreVisualRadiusWorld = 3.72 * finalScaleXZ;
    return (coreVisualRadiusWorld / (2 * halfFrustumWorld)) * heightPx;
  }

  private computeCoreProjectedTopPx(finalScaleXZ: number, rootPosY: number): number {
    const heightPx = this.container.clientHeight || window.innerHeight || 1;
    return heightPx * 0.5 - this.computeCoreProjectedRadiusPx(finalScaleXZ, rootPosY);
  }

  /**
   * Unprojects the exact 8 Ranked Image Card screen slots & half-extents onto the bird's-eye y = 0 world plane
   * so the Main Core's own 16 expanding 3D liquid ribbons coil pixel-for-pixel around each Card border.
   */
  private updateOrbWorldTargets(): void {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth || 1024);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight || 768);
    const slots = computeRankOrbSlots(8, width, height);
    const distY = Math.max(0.5, this.camera.position.y);
    const halfH = distY * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    const halfW = halfH * this.camera.aspect;

    for (let i = 0; i < 8; i++) {
      const slot = slots[i];
      const target = this.orbWorldTargets[i];
      target.x = ((slot.x / width) * 2 - 1) * halfW;
      target.z = ((slot.y / height) * 2 - 1) * halfH;
      target.radius = (slot.radius / height) * (2 * halfH);
      target.halfW = ((slot.cardWidth * 0.5) / width) * (2 * halfW);
      target.halfH = ((slot.cardHeight * 0.5) / height) * (2 * halfH);
    }
  }

  private emitResearchTelemetry(force = false): void {
    if (force || Math.abs(this.researchProgress - this.lastEmittedBarProgress) > 0.0005) {
      this.lastEmittedBarProgress = this.researchProgress;
      this.callbacks.onResearchProgressBar?.(this.researchProgress);
    }

    let percent = 0;
    if (this.researchStatus === 'complete' || this.researchStatus === 'launching') {
      percent = 100;
    } else if (this.researchStatus === 'researching') {
      percent = Math.min(99, Math.floor(this.researchProgress * 100));
    } else if (this.researchStatus === 'rolling_back') {
      percent = this.researchProgress <= 0.0001 ? 0 : Math.min(99, Math.ceil(this.researchProgress * 100));
    }

    if (
      force ||
      this.researchStatus !== this.lastEmittedResearchStatus ||
      percent !== this.lastEmittedResearchPercent
    ) {
      this.lastEmittedResearchStatus = this.researchStatus;
      this.lastEmittedResearchPercent = percent;
      this.callbacks.onResearchStateChange?.({
        status: this.researchStatus,
        progress: this.researchProgress,
        percent,
      });
    }
  }

  public exitWhitePortal(): void {
    if (this.isDisposed || !this.whitePortalOpen) return;
    this.whitePortalOpen = false;
    this.coreDrainElapsed = 0;
    this.coreRebirthFade = 0.01;
    for (let i = 0; i < this.rig.liquidEdgeRibbons.length; i++) {
      const u = this.rig.liquidEdgeRibbons[i].mat.uniforms;
      u.uMorphT.value = 0;
      u.uMorphFade.value = 1;
    }
    this.resetResearchState();
    this.interaction.exitZoomPortal();
    this.callbacks.onWhitePortalChange?.(false);
  }

  private syncBaseColorsFromTheme(theme: CoreColorTheme): void {
    const hueOffset = (theme.hueShift || 0) / 360;
    this.baseDeepColor.set(theme.deepHex);
    this.basePrimaryColor.set(theme.primaryHex);
    this.baseAccentColor.set(theme.accentHex);
    this.baseBackdropColor.set(theme.backdropHex);

    if (hueOffset !== 0) {
      this.baseDeepColor.offsetHSL(hueOffset, 0, 0);
      this.basePrimaryColor.offsetHSL(hueOffset, 0, 0);
      this.baseAccentColor.offsetHSL(hueOffset, 0, 0);
    }

    this.liveDeepColor.copy(this.baseDeepColor);
    this.livePrimaryColor.copy(this.basePrimaryColor);
    this.liveAccentColor.copy(this.baseAccentColor);
    this.liveBackdropColor.copy(this.baseBackdropColor);
    this.dynamicColorDirty = false;
    this.lastAppliedColorSignature = Number.NaN;
  }

  private emitLiveColors(force = false): void {
    const primaryHex = `#${this.livePrimaryColor.getHexString()}`;
    const accentHex = `#${this.liveAccentColor.getHexString()}`;
    if (
      force ||
      primaryHex !== this.lastEmittedPrimaryHex ||
      accentHex !== this.lastEmittedAccentHex
    ) {
      this.lastEmittedPrimaryHex = primaryHex;
      this.lastEmittedAccentHex = accentHex;
      this.callbacks.onLiveColorChange?.(primaryHex, accentHex);
    }
  }

  private reanchorDynamicColor(): void {
    this.colorAnchorSpinY = this.interaction ? this.interaction.state.spinY : 0;
    this.colorAnchorLogZoom = this.interaction
      ? Math.log(Math.max(0.2, this.interaction.state.zoom))
      : 0;
    this.smoothedColorSpinDelta = 0;
    this.smoothedColorZoomDelta = 0;
    this.smoothedColorTiltDelta = 0;
    this.dynamicColorDirty = false;
    this.lastAppliedColorSignature = Number.NaN;
  }

  private applyBackdropColor(color: THREE.Color): void {
    this.renderer.setClearColor(color, 1);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(color);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(color);
    }
  }

  public setDynamicColorEnabled(enabled: boolean): void {
    if (this.isDisposed || this.dynamicColorEnabled === enabled) return;

    if (!enabled) {
      // Turning OFF locks onto the exact live morphed color setting
      this.dynamicColorEnabled = false;
      if (this.dynamicColorDirty) {
        const committedTheme: CoreColorTheme = {
          ...this.activeTheme,
          deepHex: `#${this.liveDeepColor.getHexString()}`,
          primaryHex: `#${this.livePrimaryColor.getHexString()}`,
          accentHex: `#${this.liveAccentColor.getHexString()}`,
          backdropHex: `#${this.liveBackdropColor.getHexString()}`,
          hueShift: 0,
        };
        this.activeTheme = committedTheme;
        this.syncBaseColorsFromTheme(committedTheme);
        this.rig.applyLiveColors(
          this.liveDeepColor,
          this.livePrimaryColor,
          this.liveAccentColor,
          committedTheme.saturation,
          committedTheme.coreWhite
        );
        this.floatingIcons.syncColors(
          this.liveDeepColor,
          this.livePrimaryColor,
          this.liveAccentColor,
          committedTheme.saturation
        );
        this.applyBackdropColor(this.liveBackdropColor);
        this.callbacks.onColorThemeCommit?.(committedTheme);
      }
      this.reanchorDynamicColor();
    } else {
      // Turning ON starts morphing seamlessly from the current color with zero jump
      this.dynamicColorEnabled = true;
      this.syncBaseColorsFromTheme(this.activeTheme);
      this.reanchorDynamicColor();
    }
  }

  public setColorTheme(theme: CoreColorTheme): void {
    if (this.isDisposed) return;
    this.activeTheme = { ...theme };
    this.syncBaseColorsFromTheme(this.activeTheme);
    this.reanchorDynamicColor();
    this.rig.applyColorTheme(this.activeTheme);
    this.floatingIcons.syncColors(
      this.liveDeepColor,
      this.livePrimaryColor,
      this.liveAccentColor,
      this.activeTheme.saturation
    );
    this.scratchBackdrop.set(this.activeTheme.backdropHex);
    this.applyBackdropColor(this.scratchBackdrop);
    this.emitLiveColors(true);
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

    // Tactile "soft cushion" press response + continuous long-press shrink-until-vanish
    // (Computed here so exact live Core scale & position drive spatial clearance detection)
    const birthTouchGate = 0.35 + 0.65 * birth.coreMaterialize;
    const pressAmp = (this.reducedMotion ? 0.45 : 1.0) * birthTouchGate;
    const rawPress = input.pressDepth * pressAmp;
    const press = this.reducedMotion ? Math.max(0, rawPress) : rawPress;
    const touchGlow = Math.max(0, press) * 0.16;

    const rawCollapseScale = input.collapseScale;
    const rootScaleXZ = THREE.MathUtils.clamp(1.0 - press * 0.054, 0.86, 1.04);
    const rootScaleY = THREE.MathUtils.clamp(1.0 - press * 0.115, 0.78, 1.05);
    const preReleaseScaleXZ = Math.max(0.0005, rootScaleXZ * rawCollapseScale);
    const camDepthScale = THREE.MathUtils.clamp(this.smoothedCameraHeight / 12.5, 0.55, 1.5);
    const rootPosY = -press * 0.22 * camDepthScale * (0.35 + 0.65 * rawCollapseScale);

    // Spatial Clearance Detection: activate Research Engine dynamically (no fixed timer!)
    // the exact instant the spinning, shrinking Core separates cleanly below the midpoint Progress zone
    const coreProjectedTopPx = this.computeCoreProjectedTopPx(preReleaseScaleXZ, rootPosY);
    const progressClearanceBottomPx =
      this.callbacks.getProgressClearanceBottomPx?.() ??
      (this.container.clientHeight || window.innerHeight || 1) * 0.32;
    const isCoreSpatiallyClear = coreProjectedTopPx >= progressClearanceBottomPx + 14;

    // Live Long-Press Research Engine State Machine:
    // - Activates automatically once long-press shrinks the Core clear of the Progress HUD
    // - Climbs live 0% -> 100%; user may keep holding at 100%
    // - Releasing at 100% locks the Main Core in place and drains its liquid energy continuously into flowing light rivers -> Orbs on ONE screen!
    // - Releasing before 100% counts numbers smoothly back down to 0% before disappearing
    let triggerCompleteBurst = false;
    if (!this.whitePortalOpen && birth.coreMaterialize > 0.65) {
      if (
        input.isLongPressing ||
        (this.researchStatus === 'complete' && input.isPressed && !input.isPinching)
      ) {
        this.zeroHoldRemaining = 0;
        if (this.researchStatus === 'hidden') {
          if (isCoreSpatiallyClear) {
            this.researchStatus = 'researching';
          }
        } else if (this.researchStatus === 'rolling_back') {
          if (isCoreSpatiallyClear) {
            this.researchStatus = 'researching';
          } else if (this.researchProgress > 0) {
            const dropRate = Math.max(0.55, this.rollbackStartProgress * 1.12);
            this.researchProgress = Math.max(0, this.researchProgress - dropRate * dt);
          } else {
            this.researchStatus = 'hidden';
          }
        }

        if (this.researchStatus === 'researching') {
          const liveCadence =
            1.0 +
            0.16 * Math.sin(this.elapsedTime * 5.2) +
            0.08 * Math.cos(this.elapsedTime * 11.3);
          this.researchProgress = Math.min(1, this.researchProgress + (dt / 2.75) * liveCadence);
          if (this.researchProgress >= 1) {
            this.researchProgress = 1;
            this.researchStatus = 'complete';
          }
        }
      } else if (this.researchStatus === 'complete') {
        if (!input.isPressed) {
          // User released at 100% -> expand the shrunken Main Core outward, and morph its OWN 16 light strands directly into the 8 Orbs!
          const liveRadiusPx = Math.max(
            26,
            this.computeCoreProjectedRadiusPx(preReleaseScaleXZ, rootPosY)
          );
          triggerCompleteBurst = true;
          this.burstPortalActive = false;
          this.burstPortalElapsed = 0;
          this.whitePortalOpen = true;
          this.coreDrainElapsed = 0;
          this.frozenReleaseScale = Math.max(0.14, rawCollapseScale);
          this.morphSpinDir = this.fluidSpinVel < -0.25 ? -1 : 1;
          this.coreRebirthFade = 1;
          this.updateOrbWorldTargets();
          this.researchStatus = 'hidden';
          this.researchProgress = 0;
          this.wasHoldingCollapse = false;
          this.peakHoldCollapse = 0;
          this.peakHoldSpin = 0;
          this.callbacks.onWhitePortalChange?.(true, {
            coreRadiusPx: liveRadiusPx,
            spinVelocity: this.fluidSpinVel,
          });
        } else {
          // Switched to two-finger pinch instead of releasing -> cancel cleanly
          this.researchStatus = 'rolling_back';
          this.rollbackStartProgress = 1;
          this.zeroHoldRemaining = 0.15;
        }
      } else if (this.researchStatus === 'researching') {
        // Released before 100% -> roll numbers smoothly back down to 0% before hiding
        this.researchStatus = 'rolling_back';
        this.rollbackStartProgress = Math.max(0.18, this.researchProgress);
        this.zeroHoldRemaining = 0.15;
      } else if (this.researchStatus === 'rolling_back') {
        if (this.researchProgress > 0) {
          const dropRate = Math.max(0.55, this.rollbackStartProgress * 1.12);
          this.researchProgress = Math.max(0, this.researchProgress - dropRate * dt);
        } else {
          this.zeroHoldRemaining -= dt;
          if (this.zeroHoldRemaining <= 0) {
            this.researchStatus = 'hidden';
            this.zeroHoldRemaining = 0;
          }
        }
      }
      this.emitResearchTelemetry();
    } else if (this.researchStatus !== 'hidden') {
      this.resetResearchState();
    }

    // Unified Single-Object Metamorphosis (Maximum Zoom NEVER launches Result Orbs!):
    // On 100% release, the shrunken Main Core EXPANDS BACK OUT from small -> large,
    // and instead of reforming its old shape, its own 16 light ribbons peel off & coil into the 8 Orbs!
    let collapseScale = rawCollapseScale;
    let drainFade = 1;
    if (this.whitePortalOpen) {
      this.coreDrainElapsed += dt;
      this.updateOrbWorldTargets();
      const expandDur = this.reducedMotion ? 0.24 : 0.44;
      const expandT = THREE.MathUtils.clamp(this.coreDrainElapsed / expandDur, 0, 1);
      const expandEased = 1 - Math.pow(1 - expandT, 3);
      // Rebound UPWARD from the shrunken release size just like normal release!
      collapseScale = this.frozenReleaseScale + (1.06 - this.frozenReleaseScale) * expandEased;
      // Non-ribbon inner core body expands briefly, then smoothly dissolves into the 16 peeling ribbons
      const bodyStart = this.reducedMotion ? 0.08 : 0.14;
      const bodyEnd = this.reducedMotion ? 0.36 : 0.62;
      drainFade = 1 - THREE.MathUtils.smoothstep(this.coreDrainElapsed, bodyStart, bodyEnd);
    } else if (this.coreRebirthFade < 1) {
      this.coreRebirthFade = THREE.MathUtils.damp(this.coreRebirthFade, 1, 4.4, dt);
      if (this.coreRebirthFade > 0.998) this.coreRebirthFade = 1;
      collapseScale = rawCollapseScale * (0.32 + 0.68 * this.coreRebirthFade);
      drainFade = this.coreRebirthFade;
    }

    const vanishFade = THREE.MathUtils.smoothstep(collapseScale, 0.004, 0.085) * drainFade;
    const isVanished = collapseScale <= 0.0015 || drainFade <= 0.002;
    const finalScaleXZ = Math.max(0.0005, rootScaleXZ * collapseScale);
    const finalScaleY = Math.max(0.0005, rootScaleY * collapseScale);

    const portalTarget = this.whitePortalOpen ? 1.0 : 0.0;
    const portalRate = this.whitePortalOpen ? 2.4 : 4.5;
    this.whitePortalVisual = THREE.MathUtils.damp(this.whitePortalVisual, portalTarget, portalRate, dt);
    if (!this.whitePortalOpen && this.whitePortalVisual < 0.001) {
      this.whitePortalVisual = 0;
    } else if (this.whitePortalOpen && this.whitePortalVisual > 0.999) {
      this.whitePortalVisual = 1;
    }

    if (Math.abs(this.whitePortalVisual - this.lastReportedPortalVisual) > 0.0008) {
      this.lastReportedPortalVisual = this.whitePortalVisual;
      this.callbacks.onWhitePortalProgress?.(this.whitePortalVisual);
    }

    // Gesture-driven dynamic color morphing (ON = shifts across rich multi-color palettes via 360° drag rotation & zoom)
    if (this.dynamicColorEnabled && !this.whitePortalOpen) {
      const rawSpinDelta = input.spinY - this.colorAnchorSpinY;
      const rawZoomDelta = Math.log(Math.max(0.2, input.zoom)) - this.colorAnchorLogZoom;
      const rawTiltDelta = input.tiltX * 0.65 - input.tiltZ * 0.65;

      this.smoothedColorSpinDelta = THREE.MathUtils.damp(
        this.smoothedColorSpinDelta,
        rawSpinDelta,
        7.5,
        dt
      );
      this.smoothedColorZoomDelta = THREE.MathUtils.damp(
        this.smoothedColorZoomDelta,
        rawZoomDelta,
        7.5,
        dt
      );
      this.smoothedColorTiltDelta = THREE.MathUtils.damp(
        this.smoothedColorTiltDelta,
        rawTiltDelta,
        6.0,
        dt
      );

      const spinHueTurns = (this.smoothedColorSpinDelta * 56) / 360;
      const zoomHueTurns = (this.smoothedColorZoomDelta * 168) / 360;
      const tiltHueTurns = (this.smoothedColorTiltDelta * 22) / 360;
      const primaryTurns = spinHueTurns + zoomHueTurns + tiltHueTurns;

      // Triadic harmonic split driven by zoom & orbit so colors form lush multi-tone palettes
      const splitWave =
        Math.sin(this.smoothedColorZoomDelta * 2.45 + this.smoothedColorSpinDelta * 0.62) *
        (46 / 360);
      const deepTurns = primaryTurns - splitWave * 0.72;
      const accentTurns = primaryTurns + splitWave;

      const sig = primaryTurns * 1000 + splitWave * 317;
      if (
        Number.isNaN(this.lastAppliedColorSignature) ||
        Math.abs(sig - this.lastAppliedColorSignature) > 0.12
      ) {
        this.lastAppliedColorSignature = sig;

        if (
          Math.abs(this.smoothedColorSpinDelta) > 0.015 ||
          Math.abs(this.smoothedColorZoomDelta) > 0.015
        ) {
          this.dynamicColorDirty = true;
        }

        this.liveDeepColor.copy(this.baseDeepColor).offsetHSL(deepTurns, 0, 0);
        this.livePrimaryColor.copy(this.basePrimaryColor).offsetHSL(primaryTurns, 0, 0);
        this.liveAccentColor.copy(this.baseAccentColor).offsetHSL(accentTurns, 0, 0);

        // Keep deep obsidian backdrop harmonized with the live hue without losing dark contrast
        this.baseBackdropColor.getHSL(this.hslScratch);
        const bgLightness = THREE.MathUtils.clamp(this.hslScratch.l, 0.014, 0.042);
        const bgSat = Math.max(0.55, this.hslScratch.s);
        const bgHue = (((this.hslScratch.h + primaryTurns) % 1) + 1) % 1;
        this.liveBackdropColor.setHSL(bgHue, bgSat, bgLightness);

        this.rig.applyLiveColors(
          this.liveDeepColor,
          this.livePrimaryColor,
          this.liveAccentColor,
          this.activeTheme.saturation,
          this.activeTheme.coreWhite
        );
        this.floatingIcons.syncColors(
          this.liveDeepColor,
          this.livePrimaryColor,
          this.liveAccentColor,
          this.activeTheme.saturation
        );
        this.applyBackdropColor(this.liveBackdropColor);
        this.emitLiveColors();
      }
    }

    // Continuous vortex phase (monotonically advances on zoom-in, reverses on zoom-out, zero jump on stop)
    this.circulationPhase += dt * input.zoomCirculation * 3.4 * motionScale;
    const circPhase = this.circulationPhase;
    const circIntensity = input.zoomCirculation;
    const depthSpread = THREE.MathUtils.clamp(1.0 + (input.zoom - 1.0) * 0.42, 0.78, 1.65);

    // Continuous long-press turbine spin phase (higher max RPM, monotonic integral -> zero jump on accel/decel)
    const turboMotionScale = this.reducedMotion ? 0.35 : 1.0;
    this.turboSpinPhase += dt * input.holdSpinLevel * 21.0 * turboMotionScale;
    const turboPhase = this.turboSpinPhase;
    const flowPhase = circPhase + turboPhase * 0.45;

    // 4. Apply Bird's-Eye Preserving 3D Tilt + Ambient Micro-Drift + Tactile Cushion + Continuous Expansion
    const idleDriftX = Math.sin(t * 0.36) * 0.042 * birth.idleBlend * motionScale;
    const idleDriftZ = Math.cos(t * 0.29) * 0.042 * birth.idleBlend * motionScale;

    // Flatten tilt cleanly to level y = 0 plane during Core-to-Orb ribbon metamorphosis for pixel-exact alignment
    const targetTiltX = this.whitePortalOpen ? 0 : input.tiltX + idleDriftX;
    const targetTiltZ = this.whitePortalOpen ? 0 : input.tiltZ + idleDriftZ;
    this.smoothedTiltX = THREE.MathUtils.damp(this.smoothedTiltX, targetTiltX, 12, dt);
    this.smoothedTiltZ = THREE.MathUtils.damp(this.smoothedTiltZ, targetTiltZ, 12, dt);

    this.rig.rootGroup.rotation.set(this.smoothedTiltX, 0, this.smoothedTiltZ);
    this.rig.rootGroup.scale.set(finalScaleXZ, finalScaleY, finalScaleXZ);
    this.rig.rootGroup.position.y = this.whitePortalOpen ? 0 : rootPosY;

    // Real-time Rotational Fluid Physics for Zero-Gravity Space-Droplet Edges:
    // 1) Instantaneous signed angular velocity ω & angular acceleration torque dω/dt
    const drainSwirlBoost = this.whitePortalOpen
      ? Math.max(0, 1 - this.coreDrainElapsed / 1.12) * 4.2
      : 0;
    const rawSpinVel =
      (input.velY + input.holdSpinLevel * 6.8 + input.zoomCirculation * 2.2 + drainSwirlBoost) *
      motionScale;
    this.fluidSpinVel = THREE.MathUtils.damp(this.fluidSpinVel, rawSpinVel, 10.5, dt);
    const angularAccel = THREE.MathUtils.clamp(
      (this.fluidSpinVel - this.prevFluidSpinVel) / Math.max(dt, 0.008),
      -42,
      42
    );
    this.prevFluidSpinVel = this.fluidSpinVel;

    // 2) Second-order elastic centrifugal stretch & polar flattening (F_c ~ m * ω² * r)
    const omegaAbs = Math.abs(this.fluidSpinVel);
    const targetCentrifugal = THREE.MathUtils.clamp(
      (omegaAbs * omegaAbs * 0.036 + omegaAbs * 0.048) * motionScale,
      0,
      1.15
    );
    const centForce = (targetCentrifugal - this.fluidCentrifugal) * 28.0 - this.fluidCentrifugalVel * 6.8;
    this.fluidCentrifugalVel += centForce * dt;
    this.fluidCentrifugal = THREE.MathUtils.clamp(
      this.fluidCentrifugal + this.fluidCentrifugalVel * dt,
      -0.08,
      1.28
    );

    // 3) Capillary slosh energy excited by rotational torque, tilt inertia & soft cushion impulse
    const pressImpulse = Math.abs(press - this.prevPressDepth) / Math.max(dt, 0.008);
    this.prevPressDepth = press;
    const tiltSpeed = Math.hypot(input.velTiltX, input.velTiltZ);
    const torqueExcitation =
      (Math.abs(angularAccel) * 0.019 + tiltSpeed * 0.28 + pressImpulse * 0.09) * motionScale;
    this.fluidSloshEnergy = Math.min(
      1.35,
      this.fluidSloshEnergy * Math.exp(-dt * 2.6) + torqueExcitation * dt * 6.2
    );

    // 4) 2D weightless space-droplet slosh vector (second-order spring-damper surface tension)
    const spinAngle = input.spinY;
    const torqueSloshX = Math.cos(spinAngle) * angularAccel * 0.024 * motionScale;
    const torqueSloshZ = Math.sin(spinAngle) * angularAccel * 0.024 * motionScale;
    const driveSloshX = THREE.MathUtils.clamp(-input.velTiltZ * 0.42 + torqueSloshX, -1.35, 1.35);
    const driveSloshZ = THREE.MathUtils.clamp(input.velTiltX * 0.42 + torqueSloshZ, -1.35, 1.35);
    const sloshAccelX = (driveSloshX - this.fluidSloshX) * 22.0 - this.fluidSloshVelX * 4.4;
    const sloshAccelZ = (driveSloshZ - this.fluidSloshZ) * 22.0 - this.fluidSloshVelZ * 4.4;
    this.fluidSloshVelX += sloshAccelX * dt;
    this.fluidSloshVelZ += sloshAccelZ * dt;
    this.fluidSloshX = THREE.MathUtils.clamp(this.fluidSloshX + this.fluidSloshVelX * dt, -1.1, 1.1);
    this.fluidSloshZ = THREE.MathUtils.clamp(this.fluidSloshZ + this.fluidSloshVelZ * dt, -1.1, 1.1);

    // Push live fluid physics into all Core liquid shaders in O(1) (zero GC)
    const shaderCentrifugal = Math.max(0, this.fluidCentrifugal);
    this.rig.applyFluidPhysics(
      this.fluidSpinVel,
      shaderCentrifugal,
      this.fluidSloshEnergy,
      this.fluidSloshX,
      this.fluidSloshZ
    );

    // 5) Second-order rotational spring-damper inertia across the 4 liquid shells:
    // Inner shell follows torque crisply; outer shells trail with viscous mass, overshoot softly, and settle under surface tension
    const shellStiffness: [number, number, number, number] = [48.0, 25.0, 14.5, 8.8];
    const shellDamping: [number, number, number, number] = [10.4, 6.6, 4.7, 3.35];
    const pressLagRates: [number, number, number, number] = [21.0, 14.5, 10.2, 7.2];
    const turboLagRates: [number, number, number, number] = [16.0, 10.5, 7.2, 4.8];
    for (let i = 0; i < 4; i++) {
      const angErr = input.spinY - this.ringSpinLag[i];
      const angAccel = angErr * shellStiffness[i] - this.ringSpinAngVel[i] * shellDamping[i];
      this.ringSpinAngVel[i] += angAccel * dt;
      this.ringSpinLag[i] += this.ringSpinAngVel[i] * dt;
      this.ringPressLag[i] = THREE.MathUtils.damp(this.ringPressLag[i], press, pressLagRates[i], dt);
      this.ringTurboPhase[i] = THREE.MathUtils.damp(this.ringTurboPhase[i], turboPhase, turboLagRates[i], dt);
    }

    // Central Core & Crystalline Containment Rotation + Extra Plush Inner Cushion + Centrifugal Oblateness
    const coreScale = Math.max(0.001, 0.16 + birth.coreMaterialize * 0.84);
    const coreSquishXZ = THREE.MathUtils.clamp(
      (1.0 - press * 0.024) * (1.0 + shaderCentrifugal * 0.045),
      0.9,
      1.12
    );
    const coreSquishY = THREE.MathUtils.clamp(
      (1.0 - press * 0.045) * (1.0 - shaderCentrifugal * 0.085),
      0.8,
      1.04
    );
    this.rig.centralCoreGroup.scale.set(
      coreScale * coreSquishXZ,
      coreScale * coreSquishY,
      coreScale * coreSquishXZ
    );
    this.rig.centralCoreGroup.rotation.y =
      this.ringSpinLag[0] + t * 0.18 * motionScale + circPhase * 0.62 + this.ringTurboPhase[0] * 1.25;

    this.rig.crystalCageGroup.rotation.x =
      t * 0.22 * motionScale + this.smoothedTiltX * 0.35 + this.ringTurboPhase[0] * 0.48;
    this.rig.crystalCageGroup.rotation.y =
      -t * 0.31 * motionScale + this.ringSpinLag[0] * 0.35 - circPhase * 0.78 - this.ringTurboPhase[0] * 1.65;
    this.rig.crystalCageGroup.rotation.z = Math.sin(t * 0.4) * 0.22 * motionScale;

    this.rig.crystalShellMat.opacity =
      birth.coreMaterialize * vanishFade * (0.22 + input.kineticEnergy * 0.12 + touchGlow * 0.16);
    this.rig.crystalShellMat.emissiveIntensity =
      (0.26 + pulse * 0.2 + input.kineticEnergy * 0.38 + touchGlow * 0.55) * vanishFade;
    this.rig.crystalWireMat.opacity =
      birth.coreMaterialize * vanishFade * (0.26 + pulse * 0.14 + input.kineticEnergy * 0.24 + touchGlow * 0.22);

    // Interlocking 3D Luminous Energy Ribbons & Inner Harmonic Crown
    const ribbonScale = Math.max(0.001, (0.58 + birth.apertureUnfold * 0.42) * (1 + Math.abs(circIntensity) * 0.06));
    this.rig.energyRibbonsGroup.scale.setScalar(ribbonScale);
    this.rig.energyRibbonsGroup.rotation.y =
      this.ringSpinLag[0] * 0.45 + circPhase * 0.85 + this.ringTurboPhase[0] * 1.38;

    const ribbonMotion = t * motionScale;
    const kineticSpin = input.kineticEnergy * 0.35;
    for (let i = 0; i < 3; i++) {
      const ribbon = this.rig.ribbonMeshes[i];
      const [baseX, baseZ, speedY, wobbleX, wobbleZ] = RIBBON_ORBIT_PARAMS[i];
      const ribbonCircDir = i % 2 === 0 ? 1 : -1;
      ribbon.rotation.set(
        baseX + Math.sin(ribbonMotion * wobbleX + flowPhase * 0.55 + i * 2.1) * 0.28 + this.smoothedTiltX * 0.22,
        ribbonMotion * (speedY + ribbonCircDir * kineticSpin) +
          (circPhase * 0.95 + this.ringTurboPhase[0] * 1.75) * ribbonCircDir +
          i * 1.05,
        baseZ + Math.cos(ribbonMotion * wobbleZ - flowPhase * 0.45 + i * 1.7) * 0.26 + this.smoothedTiltZ * 0.22
      );
      const rU = ribbon.material.uniforms;
      rU.uTime.value = t;
      rU.uUnfold.value = birth.apertureUnfold * vanishFade;
      rU.uPulse.value = pulse;
      rU.uKinetic.value = input.kineticEnergy;
      rU.uCircPhase.value = flowPhase;
      rU.uCircIntensity.value = circIntensity;
    }

    const crownU = this.rig.innerCrownMat.uniforms;
    crownU.uTime.value = t;
    crownU.uReveal.value = birth.apertureUnfold * vanishFade;
    crownU.uPulse.value = pulse;
    crownU.uKinetic.value = input.kineticEnergy;
    crownU.uCircPhase.value = flowPhase;
    crownU.uCircIntensity.value = circIntensity;

    // Update Central Plasma Shader Uniforms
    const plasmaU = this.rig.plasmaMesh.material.uniforms;
    plasmaU.uTime.value = t;
    plasmaU.uPulse.value = pulse;
    plasmaU.uKinetic.value = Math.min(1.25, input.kineticEnergy + touchGlow * 0.65);
    plasmaU.uMaterialize.value = birth.coreMaterialize * vanishFade;
    plasmaU.uSurge.value = birth.ignitionSurge;

    // Update Equatorial Singularity Spark & Volumetric Halo
    const haloU = this.rig.haloMesh.material.uniforms;
    haloU.uTime.value = t;
    haloU.uSingularity.value = birth.singularityPoint * vanishFade;
    haloU.uMaterialize.value = birth.coreMaterialize * vanishFade;
    haloU.uPulse.value = pulse;
    haloU.uSurge.value = birth.ignitionSurge;
    haloU.uKinetic.value = Math.min(1.25, input.kineticEnergy + touchGlow * 0.55);
    haloU.uOutwardWave.value = birth.outwardWave;
    haloU.uCircPhase.value = flowPhase;
    haloU.uCircIntensity.value = circIntensity;

    // Update Circuit Lattice & Physical Radial Conduits
    this.rig.circuitGroup.rotation.y =
      this.ringSpinLag[1] - t * 0.032 * motionScale - circPhase * 0.42 - this.ringTurboPhase[1] * 0.78;
    const circuitU = this.rig.circuitDiscMat.uniforms;
    circuitU.uTime.value = t;
    circuitU.uReveal.value = birth.circuitReveal * vanishFade;
    circuitU.uOutwardWave.value = birth.outwardWave;
    circuitU.uPulse.value = pulse;
    circuitU.uKinetic.value = input.kineticEnergy;
    circuitU.uCircPhase.value = flowPhase;
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
    circuitU.uPointerInfluence.value = input.pointerInfluence * birth.circuitReveal * vanishFade;

    this.rig.conduitStripMat.opacity = birth.circuitReveal * vanishFade * 0.92;
    this.rig.conduitStripMat.emissiveIntensity =
      (0.75 + pulse * 0.45 + input.kineticEnergy * 0.9 + birth.ignitionSurge * 0.65) *
      birth.circuitReveal *
      vanishFade;

    // Update Shared Metallic Ring Opacity & Reflections
    const metalFade = (birth.ringReveal[0] * 0.35 + birth.ringReveal[1] * 0.65) * vanishFade;
    for (let i = 0; i < this.rig.ringMetalMats.length; i++) {
      this.rig.ringMetalMats[i].opacity = metalFade;
    }
    this.rig.statorChannelMat.opacity = birth.ringReveal[1] * vanishFade;
    this.rig.statorChannelMat.emissiveIntensity =
      (1.0 + pulse * 0.5 + input.kineticEnergy * 0.85 + birth.ignitionSurge * 0.6) *
      birth.ringReveal[1] *
      vanishFade;

    // Counter-Rotating Living Liquid-Plasma Shell Tiers (viscous rotational lag + centrifugal stretch + gyroscopic slosh tilt)
    const idleRingSpeeds: [number, number, number, number] = [0.16, -0.085, 0.115, -0.048];
    const circRingMultipliers: [number, number, number, number] = [1.18, -0.82, 0.96, -0.64];
    const turboRingMultipliers: [number, number, number, number] = [1.45, -0.96, 1.18, -0.66];
    const restHeights: [number, number, number, number] = [0.16, 0.0, 0.24, -0.18];
    const fluidMotionBlur = THREE.MathUtils.clamp(
      shaderCentrifugal * 0.65 + this.fluidSloshEnergy * 0.28,
      0,
      1
    );

    for (let i = 0; i < 4; i++) {
      const reveal = birth.ringReveal[i];
      const group = this.rig.ringGroups[i];
      group.rotation.y =
        this.ringSpinLag[i] +
        t * idleRingSpeeds[i] * motionScale +
        circPhase * circRingMultipliers[i] +
        this.ringTurboPhase[i] * turboRingMultipliers[i];

      // Subtle 3D gyroscopic precession & weightless liquid tilt flex on outer shells
      const tierFlex = (0.04 + i * 0.042) * birth.idleBlend;
      const tierBreathTiltX = Math.sin(t * (0.62 + i * 0.18) + i * 1.3) * 0.022 * motionScale;
      const tierBreathTiltZ = Math.cos(t * (0.54 + i * 0.15) + i * 2.1) * 0.022 * motionScale;
      group.rotation.x = this.fluidSloshZ * tierFlex + tierBreathTiltX;
      group.rotation.z = -this.fluidSloshX * tierFlex + tierBreathTiltZ;

      // Subtle vertical elevation lock-in during birth + calm zero-g floating resonance + centrifugal vertical compression
      const tierPress = this.ringPressLag[i];
      const tierVerticalCushion = THREE.MathUtils.clamp(1.0 - tierPress * 0.26, 0.65, 1.1);
      const birthLift = (1 - reveal) * (i % 2 === 0 ? 0.55 : -0.45);
      const idleFloat = Math.sin(t * (0.7 + i * 0.22) + i * 1.4) * 0.032 * birth.idleBlend * motionScale;
      const circParallaxWave = circIntensity * (i % 2 === 0 ? 0.1 : -0.1);
      const centFlatten = 1.0 - shaderCentrifugal * (0.14 + i * 0.045);
      group.position.y =
        restHeights[i] * depthSpread * tierVerticalCushion * centFlatten +
        birthLift +
        idleFloat +
        circParallaxWave;

      // Physical centrifugal radial expansion + elastic surface-tension rebound when spinning
      const ringTuck = THREE.MathUtils.clamp(1.0 - tierPress * (0.012 + i * 0.004), 0.92, 1.02);
      const centStretchXZ = 1.0 + this.fluidCentrifugal * (0.038 + i * 0.026);
      const sXZ = (0.86 + reveal * 0.14) * ringTuck * centStretchXZ;
      const sY = THREE.MathUtils.clamp(1.0 - shaderCentrifugal * (0.12 + i * 0.035), 0.72, 1.06);
      group.scale.set(sXZ, sY, sXZ);

      const u = this.rig.ringShaderMats[i].uniforms;
      u.uTime.value = t;
      u.uReveal.value = reveal * vanishFade;
      u.uPulse.value = pulse;
      u.uKinetic.value = input.kineticEnergy;
      u.uCircPhase.value = flowPhase * (i % 2 === 0 ? 1 : -1);
      u.uCircIntensity.value = circIntensity;
      u.uMotionBlur.value = fluidMotionBlur;
    }

    // Update all 16 living 3D swirling Orb-style plasma boundary ribbons across Tiers 0..3:
    // On 100% release, these EXACT expanding Core ribbons unzip, stream outward like rivers, and coil into the 8 Orbs!
    const ribbons = this.rig.liquidEdgeRibbons;
    let maxRibbonFade = 0;
    for (let i = 0; i < ribbons.length; i++) {
      const entry = ribbons[i];
      const fU = entry.mat.uniforms;
      fU.uTime.value = t;
      fU.uPulse.value = pulse;
      fU.uKinetic.value = input.kineticEnergy;
      fU.uCircPhase.value = flowPhase * (i % 2 === 0 ? 1 : -1);
      fU.uCircIntensity.value = circIntensity;
      fU.uMotionBlur.value = fluidMotionBlur;

      if (this.whitePortalOpen) {
        const delay =
          (this.reducedMotion ? 0.04 : 0.08) +
          entry.orbIndex * (this.reducedMotion ? 0.018 : 0.036) +
          entry.pairIndex * (this.reducedMotion ? 0.022 : 0.046);
        const dur =
          (this.reducedMotion ? 0.44 : 0.86) +
          (entry.orbIndex % 3) * (this.reducedMotion ? 0.02 : 0.036);
        const mT = THREE.MathUtils.clamp((this.coreDrainElapsed - delay) / dur, 0, 1);
        const target = this.orbWorldTargets[entry.orbIndex];
        fU.uOrbTargetWorld.value.set(target.x, 0, target.z);
        fU.uOrbTargetRadius.value = target.radius;
        fU.uCardHalfSize.value.set(target.halfW, target.halfH);
        fU.uSpinDir.value = this.morphSpinDir;
        fU.uMorphT.value = mT;

        // Smooth cross-fade handoff right as the 2D interactive Space-Droplet Orb finishes coiling on top
        const handoffStart = delay + dur * 0.84;
        const handoffEnd = delay + dur * 1.18;
        const mFade = 1 - THREE.MathUtils.smoothstep(this.coreDrainElapsed, handoffStart, handoffEnd);
        fU.uMorphFade.value = mFade;
        fU.uReveal.value = birth.ringReveal[entry.tier];
        if (mFade > maxRibbonFade) maxRibbonFade = mFade;
      } else {
        fU.uMorphT.value = 0;
        fU.uMorphFade.value = 1;
        fU.uReveal.value = birth.ringReveal[entry.tier] * vanishFade;
      }
    }

    // Keep rootGroup visible while either the Main Core body OR any of its 16 morphing ribbons are active
    this.rig.rootGroup.visible = !isVanished || maxRibbonFade > 0.002;

    // Update Instanced Floating Focal Prisms & Stator Capacitor Nodes
    this.rig.updateInstancedParts(
      t + circPhase * 0.5 + turboPhase * 0.48,
      birth.apertureUnfold,
      pulse,
      input.kineticEnergy,
      birth.ringReveal[1],
      vanishFade
    );

    // Update Converging Birth Filaments -> Subtle Idle Circulation Streams
    const convU = this.rig.convergeLinesMat.uniforms;
    convU.uTime.value = t + circPhase * 0.55 + turboPhase * 0.36;
    convU.uVisibility.value = birth.convergeLines * vanishFade;
    convU.uFlow.value = birth.convergeFlow;
    convU.uIdleBlend.value = birth.idleBlend;
    convU.uKinetic.value = input.kineticEnergy;

    // Update GPU-Driven Circulating Particles
    this.rig.particlesPoints.rotation.y = this.ringSpinLag[2] * 0.65 + this.ringTurboPhase[2] * 0.58;
    const partU = this.rig.particlesPoints.material.uniforms;
    partU.uTime.value = t;
    partU.uVisibility.value = birth.particleVisibility * vanishFade;
    partU.uGather.value = birth.particleGather;
    partU.uKinetic.value = input.kineticEnergy;
    partU.uPulse.value = pulse;
    partU.uOutwardWave.value = birth.outwardWave;
    partU.uCircPhase.value = circPhase + turboPhase * 0.4;
    partU.uCircIntensity.value = circIntensity;

    // Update Deep Radial Substrate Grid
    const subU = this.rig.substrateMat.uniforms;
    subU.uTime.value = t;
    subU.uReveal.value = birth.substrateReveal * vanishFade;
    subU.uPulse.value = pulse;

    // Detect release after long-press shrink-spin -> fling icons outward all around into space with momentum!
    if (triggerCompleteBurst) {
      this.floatingIcons.triggerCentrifugalBurst(
        1.34,
        input.collapseScale,
        this.rig.rootGroup,
        this.rig.ringGroups
      );
    } else if (!this.burstPortalActive && this.researchStatus !== 'complete') {
      if (input.isLongPressing) {
        this.wasHoldingCollapse = true;
        this.peakHoldCollapse = Math.max(this.peakHoldCollapse, input.collapseProgress);
        this.peakHoldSpin = Math.max(this.peakHoldSpin, input.holdSpinLevel);
      } else if (this.wasHoldingCollapse) {
        if ((this.peakHoldCollapse > 0.004 || this.peakHoldSpin > 0.24) && !this.whitePortalOpen) {
          const burstPower = THREE.MathUtils.clamp(
            0.38 + this.peakHoldCollapse * 0.78 + this.peakHoldSpin * 0.25,
            0.4,
            1.35
          );
          this.floatingIcons.triggerCentrifugalBurst(
            burstPower,
            input.collapseScale,
            this.rig.rootGroup,
            this.rig.ringGroups
          );
        }
        this.wasHoldingCollapse = false;
        this.peakHoldCollapse = 0;
        this.peakHoldSpin = 0;
      }
    }

    // Update Embedded Orbital TikTok Shop & E-Commerce Icon Rotation Layers + Space Burst Projectiles
    const iconZoomFade = 1.0;
    this.floatingIcons.update(
      dt,
      t,
      this.rig.ringGroups,
      birth.ringReveal,
      vanishFade,
      iconZoomFade,
      input.kineticEnergy,
      this.reducedMotion
    );

    // Dynamic Core Lighting Intensity (smoothly drains as Core pours into light rivers -> Orbs)
    const darkDiveFade = Math.max(0.06, drainFade);
    this.rig.corePointLight.intensity =
      (birth.singularityPoint * 1.8 + birth.coreMaterialize * 2.8) *
      (0.88 +
        pulse * 0.22 +
        input.kineticEnergy * 0.45 +
        birth.ignitionSurge * 0.55 +
        touchGlow * 0.7) *
      vanishFade *
      darkDiveFade;
    this.rig.rimVioletLight.intensity =
      birth.circuitReveal *
      (1.55 + Math.cos(t * 0.9) * 0.25 + input.kineticEnergy * 0.35 + touchGlow * 0.35) *
      vanishFade *
      darkDiveFade;

    // Dynamic Bloom breathing on real GPUs — stays alive while the 16 3D Main Core ribbons coil into the 8 Orbs!
    if (this.bloomPass) {
      const baseStrength = this.activeTheme.bloom;
      const scale = baseStrength > 0.01 ? 1 : 0;
      const bloomVis = Math.max(vanishFade * darkDiveFade, maxRibbonFade * 0.96);
      this.bloomPass.strength =
        (baseStrength +
          scale * (birth.ignitionSurge * 0.24 + pulse * 0.06 + input.kineticEnergy * 0.14)) *
        bloomVis;
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
    this.floatingIcons.dispose();

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
