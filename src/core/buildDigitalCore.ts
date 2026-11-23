import * as THREE from 'three';
import {
  DEFAULT_CORE_COLOR_THEME,
  type CoreColorTheme,
} from './coreTheme';
import {
  AWAKENING_VORTEX_FRAGMENT,
  AWAKENING_VORTEX_VERTEX,
  CIRCUIT_DISC_FRAGMENT,
  CIRCUIT_DISC_VERTEX,
  CONVERGE_LINES_FRAGMENT,
  CONVERGE_LINES_VERTEX,
  CORE_HALO_FRAGMENT,
  CORE_HALO_VERTEX,
  CORE_PLASMA_FRAGMENT,
  CORE_PLASMA_VERTEX,
  CORE_RIBBON_FRAGMENT,
  CORE_RIBBON_VERTEX,
  ENERGY_RING_FRAGMENT,
  ENERGY_RING_VERTEX,
  HARMONIC_FILAMENT_FRAGMENT,
  HELIX_FILAMENTS_FRAGMENT,
  HELIX_FILAMENTS_VERTEX,
  LIQUID_ORB_RIBBON_VERTEX,
  PARTICLES_FRAGMENT,
  PARTICLES_VERTEX,
  SUBSTRATE_FRAGMENT,
  SUBSTRATE_VERTEX,
} from './shaders/coreShaders';

export interface QualityProfile {
  isSoftwareGl: boolean;
  isMobile: boolean;
  particleCount: number;
  sphereDetail: number;
  torusSegments: number;
  pixelRatio: number;
  useBloom: boolean;
  bloomScale: number;
}

export interface DigitalCoreRig {
  /** Root rotated by user touch/mouse tilt + spin */
  rootGroup: THREE.Group;
  /** Central singularity plasma + cage + interlocking 3D luminous ribbons */
  centralCoreGroup: THREE.Group;
  plasmaMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  crystalCageGroup: THREE.Group;
  crystalShellMat: THREE.MeshPhysicalMaterial;
  crystalWireMat: THREE.LineBasicMaterial;
  energyRibbonsGroup: THREE.Group;
  ribbonMeshes: [
    THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>,
    THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>,
    THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>,
  ];
  innerCrownMat: THREE.ShaderMaterial;
  haloMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** Circuit lattice & physical radial conduits */
  circuitGroup: THREE.Group;
  circuitDiscMat: THREE.ShaderMaterial;
  conduitStripMat: THREE.MeshStandardMaterial;
  conduitBodyMat: THREE.MeshStandardMaterial;
  /** Four staggered counter-rotating concentric ring tiers */
  ringGroups: [THREE.Group, THREE.Group, THREE.Group, THREE.Group];
  ringShaderMats: [
    THREE.ShaderMaterial,
    THREE.ShaderMaterial,
    THREE.ShaderMaterial,
    THREE.ShaderMaterial,
  ];
  innerFilamentMats: [THREE.ShaderMaterial, THREE.ShaderMaterial];
  /** Living 3D swirling liquid-plasma boundary ribbon loops across all 4 tiers (2 paired strands per Orb) */
  liquidEdgeRibbons: Array<{
    mat: THREE.ShaderMaterial;
    tier: 0 | 1 | 2 | 3;
    orbIndex: number;
    pairIndex: 0 | 1;
  }>;
  focalPrismsMesh: THREE.InstancedMesh;
  ringMetalMats: THREE.MeshStandardMaterial[];
  statorChannelMat: THREE.MeshStandardMaterial;
  capacitorNodesMesh: THREE.InstancedMesh;
  capacitorCount: number;
  /** Converging birth streams & ambient radial filaments */
  convergeLinesMat: THREE.ShaderMaterial;
  /** GPU circulating particles */
  particlesPoints: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** Deep spatial substrate */
  substrateMat: THREE.ShaderMaterial;
  /** Phase 2 Awakening: Counter-rotating intertwined double-helical filament layers */
  innerHelixMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  outerHelixMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** Phase 2 Awakening: Circular motion blur vortex, elastic discharge & flowing Welcome waves */
  vortexWaveMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** Dynamic lights modulated by birth, breathing & awakening */
  corePointLight: THREE.PointLight;
  rimVioletLight: THREE.PointLight;
  /** Live real-time theme updater (zero geometry/shader rebuild) */
  applyColorTheme: (theme: CoreColorTheme) => void;
  /** Zero-allocation per-frame live color updater for gesture-driven dynamic color morphing */
  applyLiveColors: (
    deep: THREE.Color,
    primary: THREE.Color,
    accent: THREE.Color,
    saturation: number,
    coreWhite: number
  ) => void;
  /** Zero-allocation per-frame rotational fluid physics updater (centrifugal bulge, Coriolis twist, capillary slosh) */
  applyFluidPhysics: (
    spinSpeed: number,
    centrifugal: number,
    sloshEnergy: number,
    sloshDirX: number,
    sloshDirZ: number
  ) => void;
  /** Updates instanced micro-droplet beads along the living liquid rim without allocations */
  updateInstancedParts: (
    time: number,
    apertureUnfold: number,
    pulse: number,
    kinetic: number,
    statorReveal: number,
    dominance?: number
  ) => void;
}

/** Deterministic PRNG so core geometry is always balanced & visually curated */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SharedThemeUniforms {
  uDeepColor: { value: THREE.Color };
  uPrimaryColor: { value: THREE.Color };
  uAccentColor: { value: THREE.Color };
  uSaturation: { value: number };
  uCoreWhite: { value: number };
}

interface SharedFluidUniforms {
  uSpinSpeed: { value: number };
  uCentrifugal: { value: number };
  uSloshEnergy: { value: number };
  uSloshDir: { value: THREE.Vector2 };
}

function createEnergyRingMaterial(
  params: {
    innerRadius: number;
    outerRadius: number;
    segments: number;
    ticks: number;
    violetMix: number;
    seed: number;
  },
  sharedTheme: SharedThemeUniforms,
  sharedFluid: SharedFluidUniforms
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uPulse: { value: 0 },
      uKinetic: { value: 0 },
      uCircPhase: { value: 0 },
      uCircIntensity: { value: 0 },
      uMotionBlur: { value: 0 },
      uImpactPulse: { value: 0 },
      uCoreDominance: { value: 1 },
      uInnerRadius: { value: params.innerRadius },
      uOuterRadius: { value: params.outerRadius },
      uSegments: { value: params.segments },
      uTicks: { value: params.ticks },
      uVioletMix: { value: params.violetMix },
      uSeed: { value: params.seed },
      uSpinSpeed: sharedFluid.uSpinSpeed,
      uCentrifugal: sharedFluid.uCentrifugal,
      uSloshEnergy: sharedFluid.uSloshEnergy,
      uSloshDir: sharedFluid.uSloshDir,
      uDeepColor: sharedTheme.uDeepColor,
      uPrimaryColor: sharedTheme.uPrimaryColor,
      uAccentColor: sharedTheme.uAccentColor,
      uSaturation: sharedTheme.uSaturation,
      uCoreWhite: sharedTheme.uCoreWhite,
    },
    vertexShader: ENERGY_RING_VERTEX,
    fragmentShader: ENERGY_RING_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function createEnergyRibbonMaterial(
  seed: number,
  sharedTheme: SharedThemeUniforms
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uUnfold: { value: 0 },
      uPulse: { value: 0 },
      uKinetic: { value: 0 },
      uCircPhase: { value: 0 },
      uCircIntensity: { value: 0 },
      uMotionBlur: { value: 0 },
      uCoreDominance: { value: 1 },
      uSeed: { value: seed },
      uDeepColor: sharedTheme.uDeepColor,
      uPrimaryColor: sharedTheme.uPrimaryColor,
      uAccentColor: sharedTheme.uAccentColor,
      uSaturation: sharedTheme.uSaturation,
      uCoreWhite: sharedTheme.uCoreWhite,
    },
    vertexShader: CORE_RIBBON_VERTEX,
    fragmentShader: CORE_RIBBON_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function createLiquidOrbRibbonMaterial(
  segments: number,
  seed: number,
  baseTube: number,
  sharedTheme: SharedThemeUniforms,
  sharedFluid: SharedFluidUniforms
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uPulse: { value: 0 },
      uKinetic: { value: 0 },
      uCircPhase: { value: 0 },
      uCircIntensity: { value: 0 },
      uMotionBlur: { value: 0 },
      uCoreDominance: { value: 1 },
      uSegments: { value: segments },
      uSeed: { value: seed },
      uBaseTube: { value: baseTube },
      uMorphT: { value: 0 },
      uMorphFade: { value: 1 },
      uOrbTargetWorld: { value: new THREE.Vector3(0, 0, 0) },
      uOrbTargetRadius: { value: 0.45 },
      uCardHalfSize: { value: new THREE.Vector2(0.75, 0.95) },
      uSpinDir: { value: 1 },
      uSpinSpeed: sharedFluid.uSpinSpeed,
      uCentrifugal: sharedFluid.uCentrifugal,
      uSloshEnergy: sharedFluid.uSloshEnergy,
      uSloshDir: sharedFluid.uSloshDir,
      uDeepColor: sharedTheme.uDeepColor,
      uPrimaryColor: sharedTheme.uPrimaryColor,
      uAccentColor: sharedTheme.uAccentColor,
      uSaturation: sharedTheme.uSaturation,
      uCoreWhite: sharedTheme.uCoreWhite,
    },
    vertexShader: LIQUID_ORB_RIBBON_VERTEX,
    fragmentShader: HARMONIC_FILAMENT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Builds a single merged BufferGeometry containing `pairCount` intertwined double-helical
 * ribbon pairs (2 strands per pair). All helical motion, inward absorption pulses,
 * counter-rotation, and outward propagation happen on the GPU with 1 draw call per layer.
 */
function createIntertwinedHelixGeometry(
  pairCount: number,
  segmentsPerStrand: number,
  angleOffset: number,
  seedOffset: number
): THREE.BufferGeometry {
  const strandCount = pairCount * 2;
  const vertsPerStrand = (segmentsPerStrand + 1) * 2;
  const totalVerts = strandCount * vertsPerStrand;
  const indicesPerStrand = segmentsPerStrand * 6;
  const totalIndices = strandCount * indicesPerStrand;

  const positions = new Float32Array(totalVerts * 3);
  const aRadialT = new Float32Array(totalVerts);
  const aSide = new Float32Array(totalVerts);
  const aArmAngle = new Float32Array(totalVerts);
  const aStrandSign = new Float32Array(totalVerts);
  const aSeed = new Float32Array(totalVerts);
  const indices = new Uint16Array(totalIndices);

  let vCursor = 0;
  let iCursor = 0;

  for (let p = 0; p < pairCount; p++) {
    const armAngle = angleOffset + (p / pairCount) * Math.PI * 2;
    const pairSeed = (seedOffset + p / pairCount) % 1;

    for (let s = 0; s < 2; s++) {
      const strandSign = s === 0 ? 1.0 : -1.0;
      const baseVertex = vCursor;

      for (let seg = 0; seg <= segmentsPerStrand; seg++) {
        const t = seg / segmentsPerStrand;

        // Left & right ribbon edge vertices
        for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
          const side = sideIdx === 0 ? -1.0 : 1.0;
          positions[vCursor * 3] = 0;
          positions[vCursor * 3 + 1] = 0;
          positions[vCursor * 3 + 2] = 0;
          aRadialT[vCursor] = t;
          aSide[vCursor] = side;
          aArmAngle[vCursor] = armAngle;
          aStrandSign[vCursor] = strandSign;
          aSeed[vCursor] = pairSeed;
          vCursor++;
        }

        if (seg < segmentsPerStrand) {
          const row = baseVertex + seg * 2;
          indices[iCursor++] = row;
          indices[iCursor++] = row + 1;
          indices[iCursor++] = row + 2;
          indices[iCursor++] = row + 1;
          indices[iCursor++] = row + 3;
          indices[iCursor++] = row + 2;
        }
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('aRadialT', new THREE.BufferAttribute(aRadialT, 1));
  geom.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
  geom.setAttribute('aArmAngle', new THREE.BufferAttribute(aArmAngle, 1));
  geom.setAttribute('aStrandSign', new THREE.BufferAttribute(aStrandSign, 1));
  geom.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  return geom;
}

function createHelixFilamentMaterial(
  layerSign: number,
  sharedTheme: SharedThemeUniforms
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uVisibility: { value: 0 },
      uWaveCycle: { value: 0 },
      uWaveOrbitPhase: { value: 0 },
      uWaveTwistPhase: { value: 0 },
      uImpactPulse: { value: 0 },
      uWhiteCore: { value: 0 },
      uExplosion: { value: 0 },
      uExplosionIntensity: { value: 0 },
      uLayerSign: { value: layerSign },
      uDeepColor: sharedTheme.uDeepColor,
      uPrimaryColor: sharedTheme.uPrimaryColor,
      uAccentColor: sharedTheme.uAccentColor,
      uSaturation: sharedTheme.uSaturation,
      uCoreWhite: sharedTheme.uCoreWhite,
    },
    vertexShader: HELIX_FILAMENTS_VERTEX,
    fragmentShader: HELIX_FILAMENTS_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function buildDigitalCore(
  scene: THREE.Scene,
  quality: QualityProfile,
  initialTheme: CoreColorTheme = DEFAULT_CORE_COLOR_THEME
): DigitalCoreRig {
  const rand = mulberry32(20260417);
  const rootGroup = new THREE.Group();
  rootGroup.name = 'DigitalCoreRoot';
  scene.add(rootGroup);

  // Shared live color uniforms referenced by every shader material (instant O(1) theme update)
  const sharedTheme: SharedThemeUniforms = {
    uDeepColor: { value: new THREE.Color(initialTheme.deepHex) },
    uPrimaryColor: { value: new THREE.Color(initialTheme.primaryHex) },
    uAccentColor: { value: new THREE.Color(initialTheme.accentHex) },
    uSaturation: { value: initialTheme.saturation },
    uCoreWhite: { value: initialTheme.coreWhite },
  };

  // Shared live rotational fluid physics uniforms (instant O(1) GPU fluid deformation across all Core layers)
  const sharedFluid: SharedFluidUniforms = {
    uSpinSpeed: { value: 0 },
    uCentrifugal: { value: 0 },
    uSloshEnergy: { value: 0 },
    uSloshDir: { value: new THREE.Vector2(0, 0) },
  };

  // =========================================================================
  // LIGHTING RIG
  // =========================================================================
  const hemiLight = new THREE.HemisphereLight(0x9a78ff, 0x090418, 0.88);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xf0e8ff, 1.75);
  keyLight.position.set(4.2, 9.5, 3.8);
  scene.add(keyLight);

  const rimDirLight = new THREE.DirectionalLight(0xff2ee8, 1.05);
  rimDirLight.position.set(-5.0, 4.5, -4.5);
  scene.add(rimDirLight);

  const corePointLight = new THREE.PointLight(0x7a1bff, 0.0, 12, 1.4);
  corePointLight.position.set(0, 0.65, 0);
  rootGroup.add(corePointLight);

  const rimVioletLight = new THREE.PointLight(0x2532ff, 0.0, 11, 1.5);
  rimVioletLight.position.set(-1.9, -0.45, 1.9);
  rootGroup.add(rimVioletLight);

  // =========================================================================
  // SHARED PHYSICAL MATERIALS
  // =========================================================================
  const brushedObsidianMat = new THREE.MeshStandardMaterial({
    color: 0x100a22,
    metalness: 0.92,
    roughness: 0.22,
    emissive: 0x120628,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0,
  });

  const matteSlateMat = new THREE.MeshStandardMaterial({
    color: 0x140d2a,
    metalness: 0.58,
    roughness: 0.54,
    emissive: 0x0e0522,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0,
  });

  const darkAlloyRingMat = new THREE.MeshStandardMaterial({
    color: 0x160e32,
    metalness: 0.94,
    roughness: 0.19,
    emissive: 0x1d0944,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0,
  });

  const ringMetalMats = [brushedObsidianMat, matteSlateMat, darkAlloyRingMat];

  // =========================================================================
  // LAYER 1: CENTRAL SINGULARITY & LIVING CORE HEART
  // =========================================================================
  const centralCoreGroup = new THREE.Group();
  centralCoreGroup.name = 'CentralCoreGroup';
  rootGroup.add(centralCoreGroup);

  const plasmaGeom = new THREE.IcosahedronGeometry(0.58, quality.sphereDetail);
  const plasmaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uKinetic: { value: 0 },
      uMaterialize: { value: 0 },
      uSurge: { value: 0 },
      uAwakenCharge: { value: 0 },
      uWhiteCore: { value: 0 },
      uImpactPulse: { value: 0 },
      uCoreDominance: { value: 1 },
      uCentrifugal: sharedFluid.uCentrifugal,
      uSloshEnergy: sharedFluid.uSloshEnergy,
      uSloshDir: sharedFluid.uSloshDir,
      uDeepColor: sharedTheme.uDeepColor,
      uPrimaryColor: sharedTheme.uPrimaryColor,
      uAccentColor: sharedTheme.uAccentColor,
      uSaturation: sharedTheme.uSaturation,
      uCoreWhite: sharedTheme.uCoreWhite,
    },
    vertexShader: CORE_PLASMA_VERTEX,
    fragmentShader: CORE_PLASMA_FRAGMENT,
    transparent: true,
    depthWrite: true,
  });
  const plasmaMesh = new THREE.Mesh(plasmaGeom, plasmaMat);
  plasmaMesh.renderOrder = 3;
  centralCoreGroup.add(plasmaMesh);

  // Crystalline Geodesic Containment Cage
  const crystalCageGroup = new THREE.Group();
  centralCoreGroup.add(crystalCageGroup);

  const crystalGeom = new THREE.IcosahedronGeometry(0.79, 1);
  const crystalShellMat = new THREE.MeshPhysicalMaterial({
    color: 0x1c0b4c,
    emissive: 0x7a1bff,
    emissiveIntensity: 0.42,
    metalness: 0.12,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const crystalShell = new THREE.Mesh(crystalGeom, crystalShellMat);
  crystalShell.renderOrder = 5;
  crystalCageGroup.add(crystalShell);

  const crystalEdges = new THREE.EdgesGeometry(crystalGeom);
  const crystalWireMat = new THREE.LineBasicMaterial({
    color: 0xff2ee8,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const crystalWire = new THREE.LineSegments(crystalEdges, crystalWireMat);
  crystalWire.renderOrder = 6;
  crystalCageGroup.add(crystalWire);

  // Interlocking 3D Luminous Energy Ribbons (sleek swirling light orbitals wrapping the Core)
  const energyRibbonsGroup = new THREE.Group();
  energyRibbonsGroup.name = 'EnergyRibbonsGroup';
  centralCoreGroup.add(energyRibbonsGroup);

  const ribbonSpecs: Array<{ radius: number; tube: number; tiltX: number; tiltZ: number; seed: number }> = [
    { radius: 0.92, tube: 0.022, tiltX: 0.92, tiltZ: 0.38, seed: 0.14 },
    { radius: 1.01, tube: 0.018, tiltX: -0.78, tiltZ: 0.86, seed: 0.51 },
    { radius: 1.10, tube: 0.015, tiltX: 0.56, tiltZ: -1.04, seed: 0.83 },
  ];

  const createdRibbons: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
  for (const spec of ribbonSpecs) {
    const ribbonGeom = new THREE.TorusGeometry(spec.radius, spec.tube, 18, quality.torusSegments);
    const ribbonMat = createEnergyRibbonMaterial(spec.seed, sharedTheme);
    const ribbonMesh = new THREE.Mesh(ribbonGeom, ribbonMat);
    ribbonMesh.rotation.set(spec.tiltX, 0, spec.tiltZ);
    ribbonMesh.renderOrder = 7;
    energyRibbonsGroup.add(ribbonMesh);
    createdRibbons.push(ribbonMesh);
  }
  const ribbonMeshes = createdRibbons as [
    THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>,
    THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>,
    THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>,
  ];

  // Delicate living liquid inner crown membrane (soft bridge between core heart & outer liquid aura)
  const innerCrownMat = createEnergyRingMaterial(
    {
      innerRadius: 0.88,
      outerRadius: 1.24,
      segments: 3,
      ticks: 36,
      violetMix: 0.58,
      seed: 0.27,
    },
    sharedTheme,
    sharedFluid
  );
  const innerCrownMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.88, 1.24, quality.torusSegments, 6),
    innerCrownMat
  );
  innerCrownMesh.rotation.x = -Math.PI / 2;
  innerCrownMesh.position.y = 0.04;
  innerCrownMesh.renderOrder = 5;
  centralCoreGroup.add(innerCrownMesh);

  // Equatorial Volumetric Halo & Singularity Spark
  const haloGeom = new THREE.PlaneGeometry(8.6, 8.6);
  haloGeom.rotateX(-Math.PI / 2);
  const haloMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSingularity: { value: 0 },
      uMaterialize: { value: 0 },
      uPulse: { value: 0 },
      uSurge: { value: 0 },
      uKinetic: { value: 0 },
      uOutwardWave: { value: 0 },
      uCircPhase: { value: 0 },
      uCircIntensity: { value: 0 },
      uAwakenCharge: { value: 0 },
      uWhiteCore: { value: 0 },
      uImpactPulse: { value: 0 },
      uCoreDominance: { value: 1 },
      uDeepColor: sharedTheme.uDeepColor,
      uPrimaryColor: sharedTheme.uPrimaryColor,
      uAccentColor: sharedTheme.uAccentColor,
      uSaturation: sharedTheme.uSaturation,
      uCoreWhite: sharedTheme.uCoreWhite,
    },
    vertexShader: CORE_HALO_VERTEX,
    fragmentShader: CORE_HALO_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const haloMesh = new THREE.Mesh(haloGeom, haloMat);
  haloMesh.position.y = -0.02;
  haloMesh.renderOrder = 2;
  rootGroup.add(haloMesh);

  // =========================================================================
  // LAYER 2: FLOWING LIQUID-PLASMA INTERNAL CAUSTICS FIELD
  // =========================================================================
  const circuitGroup = new THREE.Group();
  circuitGroup.name = 'CircuitAssemblyGroup';
  rootGroup.add(circuitGroup);

  const circuitDiscGeom = new THREE.PlaneGeometry(7.6, 7.6);
  const circuitDiscMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uOutwardWave: { value: 0 },
      uPulse: { value: 0 },
      uKinetic: { value: 0 },
      uCircPhase: { value: 0 },
      uCircIntensity: { value: 0 },
      uPointerLocal: { value: new THREE.Vector2(0, 0) },
      uPointerInfluence: { value: 0 },
      uAwakenCharge: { value: 0 },
      uInternalCollapse: { value: 0 },
      uImpactPulse: { value: 0 },
      uCoreDominance: { value: 1 },
      uSpinSpeed: sharedFluid.uSpinSpeed,
      uCentrifugal: sharedFluid.uCentrifugal,
      uSloshEnergy: sharedFluid.uSloshEnergy,
      uSloshDir: sharedFluid.uSloshDir,
      uDeepColor: sharedTheme.uDeepColor,
      uPrimaryColor: sharedTheme.uPrimaryColor,
      uAccentColor: sharedTheme.uAccentColor,
      uSaturation: sharedTheme.uSaturation,
      uCoreWhite: sharedTheme.uCoreWhite,
    },
    vertexShader: CIRCUIT_DISC_VERTEX,
    fragmentShader: CIRCUIT_DISC_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const circuitDiscMesh = new THREE.Mesh(circuitDiscGeom, circuitDiscMat);
  circuitDiscMesh.rotation.x = -Math.PI / 2;
  circuitDiscMesh.position.y = -0.11;
  circuitDiscMesh.renderOrder = 1;
  circuitGroup.add(circuitDiscMesh);

  // Kept for API parity (zero rigid mechanical conduit boxes attached)
  const conduitBodyMat = matteSlateMat;
  const conduitStripMat = new THREE.MeshStandardMaterial({
    color: 0x200a44,
    emissive: 0x9c2cff,
    emissiveIntensity: 0,
    metalness: 0.2,
    roughness: 0.25,
    transparent: true,
    opacity: 0,
  });

  // =========================================================================
  // LAYER 3: FOUR LIVING ZERO-GRAVITY SPACE-DROPLET PLASMA BOUNDARY TIERS
  // (16 paired 3D swirling liquid ribbons that expand & physically coil into the 8 Orbs!)
  // =========================================================================
  const liquidEdgeRibbons: Array<{
    mat: THREE.ShaderMaterial;
    tier: 0 | 1 | 2 | 3;
    orbIndex: number;
    pairIndex: 0 | 1;
  }> = [];

  const addSwirlingPlasmaLoop = (
    parent: THREE.Group,
    tier: 0 | 1 | 2 | 3,
    spec: {
      radius: number;
      tube: number;
      offsetX: number;
      offsetZ: number;
      offsetY: number;
      tiltX: number;
      tiltZ: number;
      seed: number;
      orbIndex: number;
      pairIndex: 0 | 1;
      segments?: number;
    }
  ): THREE.ShaderMaterial => {
    const geom = new THREE.TorusGeometry(spec.radius, spec.tube, 12, quality.torusSegments);
    geom.rotateX(Math.PI / 2);
    const mat = createLiquidOrbRibbonMaterial(
      spec.segments ?? 4,
      spec.seed,
      spec.tube,
      sharedTheme,
      sharedFluid
    );
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(spec.offsetX, spec.offsetY, spec.offsetZ);
    // Stagger initial rotation.y so each ribbon unzips cleanly at a distinct azimuth around the Core
    mesh.rotation.set(spec.tiltX, spec.seed * Math.PI * 2, spec.tiltZ);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    parent.add(mesh);
    liquidEdgeRibbons.push({
      mat,
      tier,
      orbIndex: spec.orbIndex,
      pairIndex: spec.pairIndex,
    });
    return mat;
  };

  // Tier 0: Inner Living Plasma Meniscus Shell (r ~ 1.42, y = +0.16) — feeds Orbs #1 & #2
  const ringGroup0 = new THREE.Group();
  ringGroup0.position.y = 0.16;
  rootGroup.add(ringGroup0);

  const ringShader0 = createEnergyRingMaterial(
    {
      innerRadius: 1.10,
      outerRadius: 1.72,
      segments: 6,
      ticks: 48,
      violetMix: 0.26,
      seed: 0.11,
    },
    sharedTheme,
    sharedFluid
  );
  const ringPlane0 = new THREE.Mesh(
    new THREE.RingGeometry(1.10, 1.72, quality.torusSegments, 8),
    ringShader0
  );
  ringPlane0.rotation.x = -Math.PI / 2;
  ringPlane0.renderOrder = 4;
  ringGroup0.add(ringPlane0);

  const innerFilamentMat0 = addSwirlingPlasmaLoop(ringGroup0, 0, {
    radius: 1.36,
    tube: 0.014,
    offsetX: 0.05,
    offsetZ: -0.04,
    offsetY: 0.02,
    tiltX: 0.09,
    tiltZ: -0.07,
    seed: 0.12,
    orbIndex: 0,
    pairIndex: 0,
  });
  const innerFilamentMat1 = addSwirlingPlasmaLoop(ringGroup0, 0, {
    radius: 1.48,
    tube: 0.011,
    offsetX: -0.06,
    offsetZ: 0.05,
    offsetY: 0.05,
    tiltX: -0.10,
    tiltZ: 0.08,
    seed: 0.62,
    orbIndex: 0,
    pairIndex: 1,
  });
  addSwirlingPlasmaLoop(ringGroup0, 0, {
    radius: 1.42,
    tube: 0.012,
    offsetX: -0.04,
    offsetZ: -0.05,
    offsetY: -0.03,
    tiltX: 0.07,
    tiltZ: 0.09,
    seed: 0.37,
    orbIndex: 1,
    pairIndex: 0,
  });
  addSwirlingPlasmaLoop(ringGroup0, 0, {
    radius: 1.56,
    tube: 0.009,
    offsetX: 0.06,
    offsetZ: 0.04,
    offsetY: 0.03,
    tiltX: -0.08,
    tiltZ: -0.07,
    seed: 0.87,
    orbIndex: 1,
    pairIndex: 1,
  });

  const innerFilamentMats: [THREE.ShaderMaterial, THREE.ShaderMaterial] = [
    innerFilamentMat0,
    innerFilamentMat1,
  ];

  // 12 Shimmering Space Micro-Droplets orbiting softly along Tier 0 liquid meniscus
  const focalPrismCount = 12;
  const focalPrismGeom = new THREE.IcosahedronGeometry(0.036, 2);
  const focalPrismMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xff2ee8,
    emissiveIntensity: 1.3,
    metalness: 0.15,
    roughness: 0.1,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const focalPrismsMesh = new THREE.InstancedMesh(focalPrismGeom, focalPrismMat, focalPrismCount);
  focalPrismsMesh.frustumCulled = false;
  focalPrismsMesh.renderOrder = 7;
  ringGroup0.add(focalPrismsMesh);

  // Tier 1: Mid-Inner Swirling Liquid-Plasma Envelope (r ~ 2.08, y = 0.0)
  const ringGroup1 = new THREE.Group();
  ringGroup1.position.y = 0.0;
  rootGroup.add(ringGroup1);

  const statorChannelMat = new THREE.MeshStandardMaterial({
    color: 0x260b52,
    emissive: 0xff2ee8,
    emissiveIntensity: 0,
    metalness: 0.15,
    roughness: 0.2,
    transparent: true,
    opacity: 0,
  });

  const ringShader1 = createEnergyRingMaterial(
    {
      innerRadius: 1.66,
      outerRadius: 2.48,
      segments: 8,
      ticks: 72,
      violetMix: 0.48,
      seed: 0.37,
    },
    sharedTheme,
    sharedFluid
  );
  const ringPlane1 = new THREE.Mesh(
    new THREE.RingGeometry(1.66, 2.48, quality.torusSegments, 8),
    ringShader1
  );
  ringPlane1.rotation.x = -Math.PI / 2;
  ringPlane1.position.y = 0.02;
  ringPlane1.renderOrder = 4;
  ringGroup1.add(ringPlane1);

  // Four overlapping liquid-plasma boundary ribbons on Tier 1 — feeds Orbs #3 & #4
  addSwirlingPlasmaLoop(ringGroup1, 1, {
    radius: 1.98,
    tube: 0.015,
    offsetX: 0.10,
    offsetZ: 0.06,
    offsetY: 0.05,
    tiltX: 0.10,
    tiltZ: 0.08,
    seed: 0.24,
    orbIndex: 2,
    pairIndex: 0,
  });
  addSwirlingPlasmaLoop(ringGroup1, 1, {
    radius: 2.12,
    tube: 0.011,
    offsetX: -0.09,
    offsetZ: -0.08,
    offsetY: -0.05,
    tiltX: -0.09,
    tiltZ: -0.11,
    seed: 0.74,
    orbIndex: 2,
    pairIndex: 1,
  });
  addSwirlingPlasmaLoop(ringGroup1, 1, {
    radius: 2.06,
    tube: 0.013,
    offsetX: -0.08,
    offsetZ: 0.09,
    offsetY: 0.02,
    tiltX: 0.08,
    tiltZ: -0.09,
    seed: 0.49,
    orbIndex: 3,
    pairIndex: 0,
  });
  addSwirlingPlasmaLoop(ringGroup1, 1, {
    radius: 2.22,
    tube: 0.010,
    offsetX: 0.08,
    offsetZ: -0.09,
    offsetY: -0.03,
    tiltX: -0.10,
    tiltZ: 0.07,
    seed: 0.96,
    orbIndex: 3,
    pairIndex: 1,
  });

  // 24 Orbiting Luminous Space Water Micro-Beads along the living liquid boundary
  const capacitorCount = 24;
  const capGeom = new THREE.IcosahedronGeometry(0.042, 2);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x8b2cff,
    emissiveIntensity: 1.15,
    metalness: 0.12,
    roughness: 0.12,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const capacitorNodesMesh = new THREE.InstancedMesh(capGeom, capMat, capacitorCount);
  capacitorNodesMesh.frustumCulled = false;
  capacitorNodesMesh.renderOrder = 7;
  ringGroup1.add(capacitorNodesMesh);

  // Tier 2: Mid-Outer Living Plasma Wave Layer (r ~ 2.68, y = +0.24)
  const ringGroup2 = new THREE.Group();
  ringGroup2.position.y = 0.24;
  rootGroup.add(ringGroup2);

  const ringShader2 = createEnergyRingMaterial(
    {
      innerRadius: 2.28,
      outerRadius: 3.08,
      segments: 5,
      ticks: 96,
      violetMix: 0.68,
      seed: 0.63,
    },
    sharedTheme,
    sharedFluid
  );
  const ringPlane2 = new THREE.Mesh(
    new THREE.RingGeometry(2.28, 3.08, quality.torusSegments, 8),
    ringShader2
  );
  ringPlane2.rotation.x = -Math.PI / 2;
  ringPlane2.renderOrder = 5;
  ringGroup2.add(ringPlane2);

  // Four undulating Orb-style plasma edge ribbons on Tier 2 — feeds Orbs #5 & #6
  addSwirlingPlasmaLoop(ringGroup2, 2, {
    radius: 2.58,
    tube: 0.015,
    offsetX: -0.12,
    offsetZ: 0.08,
    offsetY: 0.06,
    tiltX: 0.12,
    tiltZ: -0.09,
    seed: 0.19,
    orbIndex: 4,
    pairIndex: 0,
  });
  addSwirlingPlasmaLoop(ringGroup2, 2, {
    radius: 2.74,
    tube: 0.011,
    offsetX: 0.11,
    offsetZ: -0.10,
    offsetY: -0.06,
    tiltX: -0.10,
    tiltZ: 0.11,
    seed: 0.69,
    orbIndex: 4,
    pairIndex: 1,
  });
  addSwirlingPlasmaLoop(ringGroup2, 2, {
    radius: 2.66,
    tube: 0.013,
    offsetX: 0.10,
    offsetZ: 0.11,
    offsetY: 0.03,
    tiltX: 0.09,
    tiltZ: 0.10,
    seed: 0.43,
    orbIndex: 5,
    pairIndex: 0,
  });
  addSwirlingPlasmaLoop(ringGroup2, 2, {
    radius: 2.84,
    tube: 0.009,
    offsetX: -0.10,
    offsetZ: -0.11,
    offsetY: -0.04,
    tiltX: -0.11,
    tiltZ: -0.08,
    seed: 0.91,
    orbIndex: 5,
    pairIndex: 1,
  });

  // Tier 3: Outer Ethereal Zero-Gravity Liquid Meniscus Halo (r ~ 3.30, y = -0.18)
  const ringGroup3 = new THREE.Group();
  ringGroup3.position.y = -0.18;
  rootGroup.add(ringGroup3);

  const ringShader3 = createEnergyRingMaterial(
    {
      innerRadius: 2.86,
      outerRadius: 3.74,
      segments: 4,
      ticks: 120,
      violetMix: 0.82,
      seed: 0.89,
    },
    sharedTheme,
    sharedFluid
  );
  const ringPlane3 = new THREE.Mesh(
    new THREE.RingGeometry(2.86, 3.74, quality.torusSegments, 8),
    ringShader3
  );
  ringPlane3.rotation.x = -Math.PI / 2;
  ringPlane3.position.y = 0.02;
  ringPlane3.renderOrder = 3;
  ringGroup3.add(ringPlane3);

  // Four outer wispy swirling Orb-style plasma boundary filaments — feeds Orbs #7 & #8
  addSwirlingPlasmaLoop(ringGroup3, 3, {
    radius: 3.18,
    tube: 0.016,
    offsetX: 0.15,
    offsetZ: -0.11,
    offsetY: 0.08,
    tiltX: 0.13,
    tiltZ: 0.09,
    seed: 0.08,
    orbIndex: 6,
    pairIndex: 0,
  });
  addSwirlingPlasmaLoop(ringGroup3, 3, {
    radius: 3.36,
    tube: 0.012,
    offsetX: -0.14,
    offsetZ: 0.12,
    offsetY: -0.04,
    tiltX: -0.11,
    tiltZ: -0.12,
    seed: 0.56,
    orbIndex: 6,
    pairIndex: 1,
  });
  addSwirlingPlasmaLoop(ringGroup3, 3, {
    radius: 3.28,
    tube: 0.013,
    offsetX: -0.12,
    offsetZ: -0.13,
    offsetY: 0.05,
    tiltX: 0.10,
    tiltZ: -0.12,
    seed: 0.31,
    orbIndex: 7,
    pairIndex: 0,
  });
  addSwirlingPlasmaLoop(ringGroup3, 3, {
    radius: 3.52,
    tube: 0.009,
    offsetX: 0.09,
    offsetZ: 0.14,
    offsetY: -0.05,
    tiltX: -0.09,
    tiltZ: 0.13,
    seed: 0.81,
    orbIndex: 7,
    pairIndex: 1,
  });

  // =========================================================================
  // LAYER 4: CONVERGING BIRTH ENERGY FILAMENTS
  // =========================================================================
  const lineCount = 36;
  const linePositions = new Float32Array(lineCount * 2 * 3);
  const lineRadialT = new Float32Array(lineCount * 2);
  const lineSeeds = new Float32Array(lineCount * 2);

  for (let i = 0; i < lineCount; i++) {
    const theta = (i / lineCount) * Math.PI * 2 + (rand() - 0.5) * 0.04;
    const innerR = 0.24 + rand() * 0.16;
    const outerR = 4.5 + rand() * 1.45;
    const innerY = (rand() - 0.5) * 0.18;
    const outerY = (rand() - 0.5) * 0.72;
    const seed = rand();

    const idx = i * 6;
    linePositions[idx] = Math.cos(theta) * innerR;
    linePositions[idx + 1] = innerY;
    linePositions[idx + 2] = Math.sin(theta) * innerR;

    linePositions[idx + 3] = Math.cos(theta) * outerR;
    linePositions[idx + 4] = outerY;
    linePositions[idx + 5] = Math.sin(theta) * outerR;

    lineRadialT[i * 2] = 0;
    lineRadialT[i * 2 + 1] = 1;
    lineSeeds[i * 2] = seed;
    lineSeeds[i * 2 + 1] = seed;
  }

  const convergeGeom = new THREE.BufferGeometry();
  convergeGeom.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  convergeGeom.setAttribute('aRadialT', new THREE.BufferAttribute(lineRadialT, 1));
  convergeGeom.setAttribute('aLineSeed', new THREE.BufferAttribute(lineSeeds, 1));

  const convergeLinesMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uVisibility: { value: 0 },
      uFlow: { value: 0 },
      uIdleBlend: { value: 0 },
      uKinetic: { value: 0 },
      uAwakenCharge: { value: 0 },
      uCoreDominance: { value: 1 },
      uDeepColor: sharedTheme.uDeepColor,
      uPrimaryColor: sharedTheme.uPrimaryColor,
      uAccentColor: sharedTheme.uAccentColor,
      uSaturation: sharedTheme.uSaturation,
      uCoreWhite: sharedTheme.uCoreWhite,
    },
    vertexShader: CONVERGE_LINES_VERTEX,
    fragmentShader: CONVERGE_LINES_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const convergeLines = new THREE.LineSegments(convergeGeom, convergeLinesMat);
  convergeLines.renderOrder = 2;
  rootGroup.add(convergeLines);

  // =========================================================================
  // LAYER 5: GPU-DRIVEN CIRCULATING ENERGY PARTICLES
  // =========================================================================
  const pCount = quality.particleCount;
  const pDummyPos = new Float32Array(pCount * 3);
  const pAngle = new Float32Array(pCount);
  const pRadius = new Float32Array(pCount);
  const pHeight = new Float32Array(pCount);
  const pSpeed = new Float32Array(pCount);
  const pSize = new Float32Array(pCount);
  const pPhase = new Float32Array(pCount);
  const pColorMix = new Float32Array(pCount);

  for (let i = 0; i < pCount; i++) {
    const band = rand();
    let r: number;
    if (band < 0.28) {
      r = 0.85 + rand() * 0.95;
    } else if (band < 0.74) {
      r = 1.7 + rand() * 1.9;
    } else {
      r = 3.55 + rand() * 1.45;
    }

    pAngle[i] = rand() * Math.PI * 2;
    pRadius[i] = r;
    pHeight[i] = (rand() - 0.5) * (band < 0.28 ? 0.85 : 1.35);
    const dir = rand() < 0.65 ? 1 : -1;
    pSpeed[i] = dir * (0.08 + (1.0 / (r + 0.8)) * 0.28 + rand() * 0.08);
    pSize[i] = 1.9 + rand() * 3.8;
    pPhase[i] = rand();
    pColorMix[i] = rand();
  }

  const particleGeom = new THREE.BufferGeometry();
  particleGeom.setAttribute('position', new THREE.BufferAttribute(pDummyPos, 3));
  particleGeom.setAttribute('aAngle', new THREE.BufferAttribute(pAngle, 1));
  particleGeom.setAttribute('aRadius', new THREE.BufferAttribute(pRadius, 1));
  particleGeom.setAttribute('aHeight', new THREE.BufferAttribute(pHeight, 1));
  particleGeom.setAttribute('aSpeed', new THREE.BufferAttribute(pSpeed, 1));
  particleGeom.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  particleGeom.setAttribute('aPhase', new THREE.BufferAttribute(pPhase, 1));
  particleGeom.setAttribute('aColorMix', new THREE.BufferAttribute(pColorMix, 1));

  const particlesMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: quality.pixelRatio },
      uVisibility: { value: 0 },
      uGather: { value: 0 },
      uKinetic: { value: 0 },
      uPulse: { value: 0 },
      uOutwardWave: { value: 0 },
      uCircPhase: { value: 0 },
      uCircIntensity: { value: 0 },
      uWaveActivity: { value: 0 },
      uWaveCycle: { value: 0 },
      uWaveOrbitPhase: { value: 0 },
      uImpactPulse: { value: 0 },
      uWhiteCore: { value: 0 },
      uExplosion: { value: 0 },
      uInternalSpin: { value: 0 },
      uDeepColor: sharedTheme.uDeepColor,
      uPrimaryColor: sharedTheme.uPrimaryColor,
      uAccentColor: sharedTheme.uAccentColor,
      uSaturation: sharedTheme.uSaturation,
      uCoreWhite: sharedTheme.uCoreWhite,
    },
    vertexShader: PARTICLES_VERTEX,
    fragmentShader: PARTICLES_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const particlesPoints = new THREE.Points(particleGeom, particlesMat);
  particlesPoints.frustumCulled = false;
  particlesPoints.renderOrder = 6;
  rootGroup.add(particlesPoints);

  // =========================================================================
  // LAYER 6: DEEP RADIAL SUBSTRATE DEPTH FIELD
  // =========================================================================
  const substrateGeom = new THREE.PlaneGeometry(13.6, 13.6);
  const substrateMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uPulse: { value: 0 },
      uCoreDominance: { value: 1 },
      uDeepColor: sharedTheme.uDeepColor,
      uPrimaryColor: sharedTheme.uPrimaryColor,
      uAccentColor: sharedTheme.uAccentColor,
      uSaturation: sharedTheme.uSaturation,
    },
    vertexShader: SUBSTRATE_VERTEX,
    fragmentShader: SUBSTRATE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const substrateMesh = new THREE.Mesh(substrateGeom, substrateMat);
  substrateMesh.rotation.x = -Math.PI / 2;
  substrateMesh.position.y = -1.75;
  substrateMesh.renderOrder = 0;
  rootGroup.add(substrateMesh);

  // =========================================================================
  // LAYER 7: EXTERNAL SPACE-WIDE COIN-RIM ORBITAL WAVES & REVERSE EXPLOSION
  // =========================================================================
  const helixPairsPerLayer = quality.isMobile ? 5 : 6;
  const helixSegments = quality.isMobile ? 48 : 64;

  const innerHelixGeom = createIntertwinedHelixGeometry(helixPairsPerLayer, helixSegments, 0, 0.13);
  const innerHelixMat = createHelixFilamentMaterial(1.0, sharedTheme);
  const innerHelixMesh = new THREE.Mesh(innerHelixGeom, innerHelixMat);
  innerHelixMesh.frustumCulled = false;
  innerHelixMesh.renderOrder = 8;
  innerHelixMesh.visible = false;
  rootGroup.add(innerHelixMesh);

  const outerHelixGeom = createIntertwinedHelixGeometry(
    helixPairsPerLayer,
    helixSegments,
    Math.PI / helixPairsPerLayer,
    0.61
  );
  const outerHelixMat = createHelixFilamentMaterial(-1.0, sharedTheme);
  const outerHelixMesh = new THREE.Mesh(outerHelixGeom, outerHelixMat);
  outerHelixMesh.frustumCulled = false;
  outerHelixMesh.renderOrder = 7;
  outerHelixMesh.visible = false;
  rootGroup.add(outerHelixMesh);

  const vortexWaveGeom = new THREE.PlaneGeometry(18.5, 18.5);
  vortexWaveGeom.rotateX(-Math.PI / 2);
  const vortexWaveMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCharging: { value: 0 },
      uWaveActivity: { value: 0 },
      uWaveCycle: { value: 0 },
      uWaveOrbitPhase: { value: 0 },
      uImpactPulse: { value: 0 },
      uWhiteCore: { value: 0 },
      uExplosion: { value: 0 },
      uExplosionIntensity: { value: 0 },
      uInternalSpin: { value: 0 },
      uDeepColor: sharedTheme.uDeepColor,
      uPrimaryColor: sharedTheme.uPrimaryColor,
      uAccentColor: sharedTheme.uAccentColor,
      uSaturation: sharedTheme.uSaturation,
      uCoreWhite: sharedTheme.uCoreWhite,
    },
    vertexShader: AWAKENING_VORTEX_VERTEX,
    fragmentShader: AWAKENING_VORTEX_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const vortexWaveMesh = new THREE.Mesh(vortexWaveGeom, vortexWaveMat);
  vortexWaveMesh.position.y = -0.05;
  vortexWaveMesh.frustumCulled = false;
  vortexWaveMesh.renderOrder = 3;
  vortexWaveMesh.visible = false;
  rootGroup.add(vortexWaveMesh);

  // =========================================================================
  // PRE-ALLOCATED SCRATCH OBJECTS & LIVE THEME SYNCHRONIZATION
  // =========================================================================
  const dummy = new THREE.Object3D();
  const scratchColor = new THREE.Color();
  const capDeep = new THREE.Color();
  const capPrimary = new THREE.Color();
  const capAccent = new THREE.Color();
  const tmpDark = new THREE.Color();

  const applyLiveColors = (
    deep: THREE.Color,
    primary: THREE.Color,
    accent: THREE.Color,
    saturation: number,
    coreWhite: number
  ) => {
    sharedTheme.uDeepColor.value.copy(deep);
    sharedTheme.uPrimaryColor.value.copy(primary);
    sharedTheme.uAccentColor.value.copy(accent);
    sharedTheme.uSaturation.value = saturation;
    sharedTheme.uCoreWhite.value = coreWhite;

    capDeep.copy(deep);
    capPrimary.copy(primary);
    capAccent.copy(accent);

    // Sync lights
    corePointLight.color.copy(capPrimary);
    rimVioletLight.color.copy(capDeep);
    rimDirLight.color.copy(capAccent);
    hemiLight.color.copy(capPrimary).lerp(tmpDark.set(0xffffff), 0.35);

    // Sync PBR crystal, alloy tints & emissive conduits
    crystalShellMat.color.copy(capDeep).multiplyScalar(0.28);
    crystalShellMat.emissive.copy(capPrimary);
    crystalWireMat.color.copy(capAccent);
    conduitStripMat.emissive.copy(capPrimary).lerp(capAccent, 0.38);
    statorChannelMat.emissive.copy(capAccent);
    capMat.emissive.copy(capPrimary);
    focalPrismMat.emissive.copy(capAccent);

    brushedObsidianMat.emissive.copy(capDeep).multiplyScalar(0.16);
    matteSlateMat.emissive.copy(capDeep).multiplyScalar(0.12);
    darkAlloyRingMat.emissive.copy(capPrimary).multiplyScalar(0.18);
  };

  const applyColorTheme = (theme: CoreColorTheme) => {
    const hueOffset = (theme.hueShift || 0) / 360;

    capDeep.set(theme.deepHex);
    capPrimary.set(theme.primaryHex);
    capAccent.set(theme.accentHex);

    if (hueOffset !== 0) {
      capDeep.offsetHSL(hueOffset, 0, 0);
      capPrimary.offsetHSL(hueOffset, 0, 0);
      capAccent.offsetHSL(hueOffset, 0, 0);
    }

    applyLiveColors(capDeep, capPrimary, capAccent, theme.saturation, theme.coreWhite);
  };

  applyColorTheme(initialTheme);

  const applyFluidPhysics = (
    spinSpeed: number,
    centrifugal: number,
    sloshEnergy: number,
    sloshDirX: number,
    sloshDirZ: number
  ) => {
    sharedFluid.uSpinSpeed.value = spinSpeed;
    sharedFluid.uCentrifugal.value = centrifugal;
    sharedFluid.uSloshEnergy.value = sloshEnergy;
    sharedFluid.uSloshDir.value.set(sloshDirX, sloshDirZ);
  };

  const updateInstancedParts = (
    time: number,
    apertureUnfold: number,
    pulse: number,
    kinetic: number,
    statorReveal: number,
    dominance = 1
  ) => {
    const centrifugal = sharedFluid.uCentrifugal.value;
    const slosh = sharedFluid.uSloshEnergy.value;
    const sloshX = sharedFluid.uSloshDir.value.x;
    const sloshZ = sharedFluid.uSloshDir.value.y;

    // 1. Floating Zero-Gravity Micro-Droplet Beads along Inner Liquid Meniscus (r ~ 1.42)
    focalPrismMat.opacity = apertureUnfold * dominance * (0.72 + pulse * 0.16 + kinetic * 0.1);
    const beadScale0 = Math.max(0.001, apertureUnfold);
    dummy.rotation.order = 'YXZ';
    for (let i = 0; i < focalPrismCount; i++) {
      const a = (i / focalPrismCount) * Math.PI * 2;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const cap =
        (Math.sin(a * 2.0 + time * 1.45) * 0.055 + Math.cos(a * 3.0 - time * 1.9) * 0.036) *
        (1 + slosh * 1.8);
      const r = 1.42 * (1 + cap) + centrifugal * 0.24 + (cosA * sloshX + sinA * sloshZ) * 0.16;
      const bobY =
        Math.sin(time * 1.7 + i * 1.047) * (0.065 + slosh * 0.05) * (1 - centrifugal * 0.4);
      dummy.position.set(cosA * r, bobY, sinA * r);
      dummy.rotation.set(0, -a, 0);
      const wave = Math.sin(a * 3.0 - time * 2.1 + i * 0.5) * 0.5 + 0.5;
      const breath = 0.78 + wave * 0.36 + kinetic * 0.18;
      // Subtle tangential droplet elongation as rotational spin speed increases
      const stretch = 1 + centrifugal * 0.55;
      dummy.scale.set(
        beadScale0 * 0.85 * breath,
        beadScale0 * 0.82 * breath,
        beadScale0 * 0.95 * breath * stretch
      );
      dummy.updateMatrix();
      focalPrismsMesh.setMatrixAt(i, dummy.matrix);

      scratchColor.copy(capPrimary).lerp(capAccent, 0.35 + wave * 0.65);
      if (i % 3 === 0) {
        scratchColor.lerp(tmpDark.set(0xffffff), 0.36 * sharedTheme.uCoreWhite.value);
      }
      focalPrismsMesh.setColorAt(i, scratchColor);
    }
    focalPrismsMesh.instanceMatrix.needsUpdate = true;
    if (focalPrismsMesh.instanceColor) {
      focalPrismsMesh.instanceColor.needsUpdate = true;
    }

    // 2. Orbiting Luminous Space Micro-Droplet Beads riding along the Outer Liquid Boundary (r ~ 2.12..3.18)
    capMat.opacity = statorReveal * dominance * 0.82;
    const capScale = Math.max(0.001, statorReveal);
    for (let i = 0; i < capacitorCount; i++) {
      const a = (i / capacitorCount) * Math.PI * 2 + Math.sin(time * 0.35 + i) * 0.06;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const bandBase = i % 2 === 0 ? 2.14 : 3.08;
      const cap =
        (Math.sin(a * 2.0 + time * 1.35 + i * 0.4) * 0.058 +
          Math.cos(a * 3.0 - time * 1.85) * 0.04) *
        (1 + slosh * 1.9);
      const r =
        bandBase * (1 + cap) +
        centrifugal * (0.28 + bandBase * 0.07) +
        (cosA * sloshX + sinA * sloshZ) * 0.24;
      const bobY =
        Math.sin(time * 1.45 + i * 0.82) * (0.14 + slosh * 0.09) * (1 - centrifugal * 0.45);
      dummy.position.set(cosA * r, bobY, sinA * r);
      dummy.rotation.set(0, -a + Math.PI * 0.5, 0);
      const glowWave = Math.sin(a * 2.0 - time * 2.2 + i * 0.7) * 0.5 + 0.5;
      const beadSize = (0.62 + glowWave * 0.58) * capScale;
      dummy.scale.set(beadSize * (1 + centrifugal * 0.5), beadSize * 0.86, beadSize);
      dummy.updateMatrix();
      capacitorNodesMesh.setMatrixAt(i, dummy.matrix);

      scratchColor.copy(capPrimary).lerp(capAccent, glowWave);
      if (i % 4 === 0) {
        scratchColor.lerp(tmpDark.set(0xffffff), 0.32);
      }
      capacitorNodesMesh.setColorAt(i, scratchColor);
    }
    capacitorNodesMesh.instanceMatrix.needsUpdate = true;
    if (capacitorNodesMesh.instanceColor) {
      capacitorNodesMesh.instanceColor.needsUpdate = true;
    }
  };

  updateInstancedParts(0, 0.001, 0, 0, 0.001, 1);

  return {
    rootGroup,
    centralCoreGroup,
    plasmaMesh,
    crystalCageGroup,
    crystalShellMat,
    crystalWireMat,
    energyRibbonsGroup,
    ribbonMeshes,
    innerCrownMat,
    haloMesh,
    circuitGroup,
    circuitDiscMat,
    conduitStripMat,
    conduitBodyMat,
    ringGroups: [ringGroup0, ringGroup1, ringGroup2, ringGroup3],
    ringShaderMats: [ringShader0, ringShader1, ringShader2, ringShader3],
    innerFilamentMats,
    liquidEdgeRibbons,
    focalPrismsMesh,
    ringMetalMats,
    statorChannelMat,
    capacitorNodesMesh,
    capacitorCount,
    convergeLinesMat,
    particlesPoints,
    substrateMat,
    innerHelixMesh,
    outerHelixMesh,
    vortexWaveMesh,
    corePointLight,
    rimVioletLight,
    applyColorTheme,
    applyLiveColors,
    applyFluidPhysics,
    updateInstancedParts,
  };
}
