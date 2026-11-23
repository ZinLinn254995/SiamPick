import * as THREE from 'three';
import {
  DEFAULT_CORE_COLOR_THEME,
  type CoreColorTheme,
} from './coreTheme';
import {
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
  /** Dynamic lights modulated by birth & breathing */
  corePointLight: THREE.PointLight;
  rimVioletLight: THREE.PointLight;
  /** Live real-time theme updater (zero geometry/shader rebuild) */
  applyColorTheme: (theme: CoreColorTheme) => void;
  /** Updates instanced aperture fins & capacitor waves without allocations */
  updateInstancedParts: (
    time: number,
    apertureUnfold: number,
    pulse: number,
    kinetic: number,
    statorReveal: number
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

function createEnergyRingMaterial(
  params: {
    innerRadius: number;
    outerRadius: number;
    segments: number;
    ticks: number;
    violetMix: number;
    seed: number;
  },
  sharedTheme: SharedThemeUniforms
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uPulse: { value: 0 },
      uKinetic: { value: 0 },
      uCircPhase: { value: 0 },
      uCircIntensity: { value: 0 },
      uInnerRadius: { value: params.innerRadius },
      uOuterRadius: { value: params.outerRadius },
      uSegments: { value: params.segments },
      uTicks: { value: params.ticks },
      uVioletMix: { value: params.violetMix },
      uSeed: { value: params.seed },
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

function createOuterBracketGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.32, -0.065);
  shape.lineTo(0.32, -0.065);
  shape.lineTo(0.24, 0.075);
  shape.lineTo(-0.24, 0.075);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.016,
    bevelThickness: 0.016,
  });
  geom.center();
  return geom;
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

function createHarmonicFilamentMaterial(
  segments: number,
  seed: number,
  sharedTheme: SharedThemeUniforms
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uPulse: { value: 0 },
      uKinetic: { value: 0 },
      uCircPhase: { value: 0 },
      uCircIntensity: { value: 0 },
      uSegments: { value: segments },
      uSeed: { value: seed },
      uDeepColor: sharedTheme.uDeepColor,
      uPrimaryColor: sharedTheme.uPrimaryColor,
      uAccentColor: sharedTheme.uAccentColor,
      uSaturation: sharedTheme.uSaturation,
      uCoreWhite: sharedTheme.uCoreWhite,
    },
    vertexShader: CORE_RIBBON_VERTEX,
    fragmentShader: HARMONIC_FILAMENT_FRAGMENT,
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

  // Delicate luminous inner harmonic crown ring (smooth bridge between core & inner ring tier)
  const innerCrownMat = createEnergyRingMaterial(
    {
      innerRadius: 0.95,
      outerRadius: 1.14,
      segments: 3,
      ticks: 36,
      violetMix: 0.58,
      seed: 0.27,
    },
    sharedTheme
  );
  const innerCrownMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.14, quality.torusSegments),
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
  // LAYER 2: INTRICATE DIGITAL CIRCUIT LATTICE & RADIAL CONDUITS
  // =========================================================================
  const circuitGroup = new THREE.Group();
  circuitGroup.name = 'CircuitAssemblyGroup';
  rootGroup.add(circuitGroup);

  const circuitDiscGeom = new THREE.PlaneGeometry(6.9, 6.9);
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

  // 8 Physical Beveled Radial Conduits with recessed optical strips
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

  const conduitBodyGeom = new THREE.BoxGeometry(0.068, 0.042, 1.84);
  const conduitStripGeom = new THREE.BoxGeometry(0.018, 0.048, 1.72);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const arm = new THREE.Group();
    arm.rotation.y = angle;

    const body = new THREE.Mesh(conduitBodyGeom, conduitBodyMat);
    body.position.set(0, -0.075, 2.04);
    arm.add(body);

    const strip = new THREE.Mesh(conduitStripGeom, conduitStripMat);
    strip.position.set(0, -0.068, 2.04);
    arm.add(strip);

    circuitGroup.add(arm);
  }

  // =========================================================================
  // LAYER 3: FOUR STAGGERED CONCENTRIC ENERGY RING TIERS
  // =========================================================================
  // Tier 0: Inner Precision Optical Ring (r = 1.38, y = +0.18)
  const ringGroup0 = new THREE.Group();
  ringGroup0.position.y = 0.18;
  rootGroup.add(ringGroup0);

  const ringShader0 = createEnergyRingMaterial(
    {
      innerRadius: 1.24,
      outerRadius: 1.54,
      segments: 6,
      ticks: 48,
      violetMix: 0.22,
      seed: 0.11,
    },
    sharedTheme
  );
  const ringPlane0 = new THREE.Mesh(new THREE.RingGeometry(1.24, 1.54, quality.torusSegments), ringShader0);
  ringPlane0.rotation.x = -Math.PI / 2;
  ringPlane0.renderOrder = 4;
  ringGroup0.add(ringPlane0);

  // Luminous segmented optical filaments (replaces opaque dark stroke circle with flowing light arcs)
  const innerFilamentMat0 = createHarmonicFilamentMaterial(6, 0.18, sharedTheme);
  const innerFilamentGeom0 = new THREE.TorusGeometry(1.38, 0.011, 14, quality.torusSegments);
  innerFilamentGeom0.rotateX(Math.PI / 2);
  const innerFilamentMesh0 = new THREE.Mesh(innerFilamentGeom0, innerFilamentMat0);
  innerFilamentMesh0.renderOrder = 6;
  ringGroup0.add(innerFilamentMesh0);

  const innerFilamentMat1 = createHarmonicFilamentMaterial(4, 0.64, sharedTheme);
  const innerFilamentGeom1 = new THREE.TorusGeometry(1.48, 0.0065, 12, quality.torusSegments);
  innerFilamentGeom1.rotateX(Math.PI / 2);
  const innerFilamentMesh1 = new THREE.Mesh(innerFilamentGeom1, innerFilamentMat1);
  innerFilamentMesh1.position.y = 0.06;
  innerFilamentMesh1.renderOrder = 6;
  ringGroup0.add(innerFilamentMesh1);

  const innerFilamentMats: [THREE.ShaderMaterial, THREE.ShaderMaterial] = [
    innerFilamentMat0,
    innerFilamentMat1,
  ];

  // 12 Floating Crystalline Focal Prisms orbiting gracefully along Tier 0 (additive light-crystals, zero dark silhouette)
  const focalPrismCount = 12;
  const focalPrismGeom = new THREE.OctahedronGeometry(0.038, 0);
  const focalPrismMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xff2ee8,
    emissiveIntensity: 1.25,
    metalness: 0.25,
    roughness: 0.14,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const focalPrismsMesh = new THREE.InstancedMesh(focalPrismGeom, focalPrismMat, focalPrismCount);
  focalPrismsMesh.frustumCulled = false;
  focalPrismsMesh.renderOrder = 7;
  ringGroup0.add(focalPrismsMesh);

  // Tier 1: Primary Composite Stator Ring (r = 2.08, y = 0.0)
  const ringGroup1 = new THREE.Group();
  ringGroup1.position.y = 0.0;
  rootGroup.add(ringGroup1);

  const statorChassisGeom = new THREE.TorusGeometry(2.08, 0.058, 18, quality.torusSegments);
  statorChassisGeom.rotateX(Math.PI / 2);
  ringGroup1.add(new THREE.Mesh(statorChassisGeom, brushedObsidianMat));

  const statorChannelMat = new THREE.MeshStandardMaterial({
    color: 0x260b52,
    emissive: 0xff2ee8,
    emissiveIntensity: 0,
    metalness: 0.15,
    roughness: 0.2,
    transparent: true,
    opacity: 0,
  });
  const statorChannelGeom = new THREE.TorusGeometry(2.08, 0.02, 12, quality.torusSegments);
  statorChannelGeom.rotateX(Math.PI / 2);
  const statorChannelMesh = new THREE.Mesh(statorChannelGeom, statorChannelMat);
  statorChannelMesh.position.y = 0.044;
  ringGroup1.add(statorChannelMesh);

  const ringShader1 = createEnergyRingMaterial(
    {
      innerRadius: 1.84,
      outerRadius: 2.32,
      segments: 8,
      ticks: 72,
      violetMix: 0.42,
      seed: 0.37,
    },
    sharedTheme
  );
  const ringPlane1 = new THREE.Mesh(new THREE.RingGeometry(1.84, 2.32, quality.torusSegments), ringShader1);
  ringPlane1.rotation.x = -Math.PI / 2;
  ringPlane1.position.y = 0.025;
  ringPlane1.renderOrder = 4;
  ringGroup1.add(ringPlane1);

  // 24 Instanced Micro-Capacitor Nodes seated on the Primary Stator Ring
  const capacitorCount = 24;
  const capGeom = new THREE.BoxGeometry(0.055, 0.075, 0.12);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x8b2cff,
    emissiveIntensity: 0.85,
    metalness: 0.4,
    roughness: 0.24,
    transparent: true,
    opacity: 0,
  });
  const capacitorNodesMesh = new THREE.InstancedMesh(capGeom, capMat, capacitorCount);
  capacitorNodesMesh.frustumCulled = false;
  ringGroup1.add(capacitorNodesMesh);

  // Tier 2: Elevated Holographic Logic Ring (r = 2.68, y = +0.30)
  const ringGroup2 = new THREE.Group();
  ringGroup2.position.y = 0.30;
  rootGroup.add(ringGroup2);

  const ringShader2 = createEnergyRingMaterial(
    {
      innerRadius: 2.48,
      outerRadius: 2.86,
      segments: 5,
      ticks: 96,
      violetMix: 0.64,
      seed: 0.63,
    },
    sharedTheme
  );
  const ringPlane2 = new THREE.Mesh(new THREE.RingGeometry(2.48, 2.86, quality.torusSegments), ringShader2);
  ringPlane2.rotation.x = -Math.PI / 2;
  ringPlane2.renderOrder = 5;
  ringGroup2.add(ringPlane2);

  const logicRimGeom = new THREE.TorusGeometry(2.67, 0.015, 10, quality.torusSegments);
  logicRimGeom.rotateX(Math.PI / 2);
  ringGroup2.add(new THREE.Mesh(logicRimGeom, darkAlloyRingMat));

  // Tier 3: Deep Recessed Outer Field Boundary Ring (r = 3.35, y = -0.22)
  const ringGroup3 = new THREE.Group();
  ringGroup3.position.y = -0.22;
  rootGroup.add(ringGroup3);

  const outerChassisGeom = new THREE.TorusGeometry(3.35, 0.044, 16, quality.torusSegments);
  outerChassisGeom.rotateX(Math.PI / 2);
  ringGroup3.add(new THREE.Mesh(outerChassisGeom, matteSlateMat));

  const ringShader3 = createEnergyRingMaterial(
    {
      innerRadius: 3.12,
      outerRadius: 3.58,
      segments: 4,
      ticks: 120,
      violetMix: 0.78,
      seed: 0.89,
    },
    sharedTheme
  );
  const ringPlane3 = new THREE.Mesh(new THREE.RingGeometry(3.12, 3.58, quality.torusSegments), ringShader3);
  ringPlane3.rotation.x = -Math.PI / 2;
  ringPlane3.position.y = 0.02;
  ringPlane3.renderOrder = 3;
  ringGroup3.add(ringPlane3);

  // 4 Sculpted Cardinal Precision Anchor Brackets on Outer Ring
  const bracketGeom = createOuterBracketGeometry();
  const bracketSlitGeom = new THREE.BoxGeometry(0.28, 0.024, 0.024);
  for (let i = 0; i < 4; i++) {
    const theta = (i / 4) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.rotation.y = theta;

    const bracket = new THREE.Mesh(bracketGeom, brushedObsidianMat);
    bracket.rotation.x = Math.PI / 2;
    bracket.position.set(0, 0.04, 3.35);
    holder.add(bracket);

    const slit = new THREE.Mesh(bracketSlitGeom, statorChannelMat);
    slit.position.set(0, 0.092, 3.35);
    holder.add(slit);

    ringGroup3.add(holder);
  }

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
  // PRE-ALLOCATED SCRATCH OBJECTS & LIVE THEME SYNCHRONIZATION
  // =========================================================================
  const dummy = new THREE.Object3D();
  const scratchColor = new THREE.Color();
  const capDeep = new THREE.Color();
  const capPrimary = new THREE.Color();
  const capAccent = new THREE.Color();
  const tmpDark = new THREE.Color();

  const applyColorTheme = (theme: CoreColorTheme) => {
    const hueOffset = (theme.hueShift || 0) / 360;

    sharedTheme.uDeepColor.value.set(theme.deepHex);
    sharedTheme.uPrimaryColor.value.set(theme.primaryHex);
    sharedTheme.uAccentColor.value.set(theme.accentHex);

    if (hueOffset !== 0) {
      sharedTheme.uDeepColor.value.offsetHSL(hueOffset, 0, 0);
      sharedTheme.uPrimaryColor.value.offsetHSL(hueOffset, 0, 0);
      sharedTheme.uAccentColor.value.offsetHSL(hueOffset, 0, 0);
    }

    sharedTheme.uSaturation.value = theme.saturation;
    sharedTheme.uCoreWhite.value = theme.coreWhite;

    capDeep.copy(sharedTheme.uDeepColor.value);
    capPrimary.copy(sharedTheme.uPrimaryColor.value);
    capAccent.copy(sharedTheme.uAccentColor.value);

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

  applyColorTheme(initialTheme);

  const updateInstancedParts = (
    time: number,
    apertureUnfold: number,
    pulse: number,
    kinetic: number,
    statorReveal: number
  ) => {
    // 1. Floating Crystalline Focal Prisms along Inner Optical Tier (r = 1.38)
    focalPrismMat.opacity = apertureUnfold * (0.76 + pulse * 0.16 + kinetic * 0.08);
    const prismScale = Math.max(0.001, apertureUnfold);
    dummy.rotation.order = 'YXZ';
    for (let i = 0; i < focalPrismCount; i++) {
      const a = (i / focalPrismCount) * Math.PI * 2;
      const wave = Math.sin(a * 3.0 - time * 2.1 + i * 0.5) * 0.5 + 0.5;
      const bobY = Math.sin(time * 1.6 + i * 1.047) * 0.028;
      dummy.position.set(Math.cos(a) * 1.38, bobY, Math.sin(a) * 1.38);
      dummy.rotation.set(0, -a, time * 0.75 + i * 0.52);
      const breath = 0.86 + wave * 0.34 + kinetic * 0.18;
      dummy.scale.set(prismScale * 0.72 * breath, prismScale * 0.72 * breath, prismScale * 1.65 * breath);
      dummy.updateMatrix();
      focalPrismsMesh.setMatrixAt(i, dummy.matrix);

      scratchColor.copy(capPrimary).lerp(capAccent, 0.35 + wave * 0.65);
      if (i % 3 === 0) {
        scratchColor.lerp(tmpDark.set(0xffffff), 0.32 * sharedTheme.uCoreWhite.value);
      }
      focalPrismsMesh.setColorAt(i, scratchColor);
    }
    focalPrismsMesh.instanceMatrix.needsUpdate = true;
    if (focalPrismsMesh.instanceColor) {
      focalPrismsMesh.instanceColor.needsUpdate = true;
    }

    // 2. Micro-Capacitor Nodes seated on the Primary Stator Ring (r = 2.08)
    capMat.opacity = statorReveal * 0.92;
    const capScale = Math.max(0.001, statorReveal);
    for (let i = 0; i < capacitorCount; i++) {
      const a = (i / capacitorCount) * Math.PI * 2;
      const glowWave = Math.sin(a * 2.0 - time * 2.2) * 0.5 + 0.5;
      dummy.position.set(Math.cos(a) * 2.08, 0.068, Math.sin(a) * 2.08);
      dummy.rotation.set(0, -a + Math.PI * 0.5, 0);
      const lift = 1 + glowWave * 0.25;
      dummy.scale.set(capScale, capScale * lift, capScale);
      dummy.updateMatrix();
      capacitorNodesMesh.setMatrixAt(i, dummy.matrix);

      scratchColor.copy(capPrimary).lerp(capAccent, glowWave);
      if (i % 6 === 0) {
        scratchColor.lerp(capDeep, 0.55);
      }
      capacitorNodesMesh.setColorAt(i, scratchColor);
    }
    capacitorNodesMesh.instanceMatrix.needsUpdate = true;
    if (capacitorNodesMesh.instanceColor) {
      capacitorNodesMesh.instanceColor.needsUpdate = true;
    }
  };

  updateInstancedParts(0, 0.001, 0, 0, 0.001);

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
    focalPrismsMesh,
    ringMetalMats,
    statorChannelMat,
    capacitorNodesMesh,
    capacitorCount,
    convergeLinesMat,
    particlesPoints,
    substrateMat,
    corePointLight,
    rimVioletLight,
    applyColorTheme,
    updateInstancedParts,
  };
}
