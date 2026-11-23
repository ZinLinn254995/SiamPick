import * as THREE from 'three';
import type { QualityProfile } from './buildDigitalCore';

const ATLAS_GRID = 4;
const CELL_SIZE = 256;
const ATLAS_SIZE = ATLAS_GRID * CELL_SIZE;
const ICON_COUNT = 16;

// Weighted selection pool: abundant Research Magnifying Glass (13) & Money (14) icons,
// mixed with TikTok Shop & E-Commerce icons (Star icon removed).
const WEIGHTED_ICON_POOL: readonly number[] = [
  13, 13, 13, 13, 13, 13,
  14, 14, 14, 14, 14, 14,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15,
];

function pickWeightedIconIndex(): number {
  return WEIGHTED_ICON_POOL[Math.floor(Math.random() * WEIGHTED_ICON_POOL.length)];
}

interface RotationLayerConfig {
  minRadius: number;
  maxRadius: number;
  yOffset: number;
  minScale: number;
  maxScale: number;
  /** Subtle independent orbital drift speed (rad/s) layered atop the ring tier's rotation */
  driftSpeed: number;
}

const ROTATION_LAYERS: readonly [
  RotationLayerConfig,
  RotationLayerConfig,
  RotationLayerConfig,
  RotationLayerConfig,
] = [
  // Layer 0: Inner Precision Optical Ring (strictly inside Core, r ~ 1.26 - 1.54)
  {
    minRadius: 1.26,
    maxRadius: 1.54,
    yOffset: 0.14,
    minScale: 0.24,
    maxScale: 0.3,
    driftSpeed: 0.15,
  },
  // Layer 1: Primary Stator Ring (strictly inside Core, r ~ 1.88 - 2.26, counter-rotating)
  {
    minRadius: 1.88,
    maxRadius: 2.26,
    yOffset: 0.16,
    minScale: 0.28,
    maxScale: 0.35,
    driftSpeed: -0.11,
  },
  // Layer 2: Elevated Holographic Logic Ring (strictly inside Core, r ~ 2.48 - 2.86)
  {
    minRadius: 2.48,
    maxRadius: 2.86,
    yOffset: 0.16,
    minScale: 0.31,
    maxScale: 0.39,
    driftSpeed: 0.095,
  },
  // Layer 3: Outer Containment Ring (strictly inside Core outer boundary, r ~ 3.08 - 3.48, counter-rotating)
  {
    minRadius: 3.08,
    maxRadius: 3.48,
    yOffset: 0.18,
    minScale: 0.34,
    maxScale: 0.42,
    driftSpeed: -0.08,
  },
];

interface OrbitalIconSlot {
  /** Which concentric Core ring tier [0..3] this icon rotates with */
  layer: 0 | 1 | 2 | 3;
  active: boolean;
  age: number;
  duration: number;
  /** Local orbital angle (radians) within its ring tier */
  angle: number;
  /** Local orbital radius within its ring tier band */
  radius: number;
  /** Slight vertical stagger within the layer */
  localY: number;
  /** Per-slot subtle angular drift multiplier */
  driftMult: number;
  /** Icon index in the 4x4 e-commerce sprite atlas [0..15] */
  iconIndex: number;
  /** Base visual size in world units */
  baseScale: number;
  /** Subtle breathing tilt sway around its tangential orientation */
  swaySpeed: number;
  swayPhase: number;
  /** Independent brighten / dim shimmer parameters */
  shimmerSpeed: number;
  shimmerPhase: number;
  /** Color palette blend [0..1] across Deep -> Primary -> Accent */
  colorMix: number;
  /** Peak luminance multiplier */
  peakGlow: number;
}

interface BurstIconSlot {
  active: boolean;
  age: number;
  duration: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  drag: number;
  rotY: number;
  rotVel: number;
  iconIndex: number;
  baseScale: number;
  colorMix: number;
  peakGlow: number;
  shimmerSpeed: number;
  shimmerPhase: number;
}

export interface FloatingEcommerceIconsSystem {
  group: THREE.Group;
  syncColors: (
    deep: THREE.Color,
    primary: THREE.Color,
    accent: THREE.Color,
    saturation: number
  ) => void;
  triggerCentrifugalBurst: (
    burstPower: number,
    coreScale: number,
    rootGroup: THREE.Group,
    ringGroups: readonly [THREE.Group, THREE.Group, THREE.Group, THREE.Group]
  ) => void;
  update: (
    dt: number,
    elapsedTime: number,
    ringGroups: readonly [THREE.Group, THREE.Group, THREE.Group, THREE.Group],
    ringReveals: readonly [number, number, number, number],
    vanishFade: number,
    zoomFade: number,
    kineticEnergy: number,
    reducedMotion: boolean
  ) => void;
  dispose: () => void;
}

const FLOATING_ICON_VERTEX = /* glsl */ `
  attribute float aCellIndex;
  attribute float aGlowAlpha;
  attribute float aColorMix;

  varying vec2 vAtlasUv;
  varying float vGlowAlpha;
  varying float vColorMix;

  void main() {
    float col = mod(aCellIndex, 4.0);
    float row = floor(aCellIndex / 4.0);
    // PlaneGeometry rotated -PI/2 around X maps uv.y=1 to screen UP (canvas top with flipY=true)
    vAtlasUv = vec2((col + uv.x) * 0.25, (3.0 - row + uv.y) * 0.25);
    vGlowAlpha = aGlowAlpha;
    vColorMix = aColorMix;

    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FLOATING_ICON_FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uDeepColor;
  uniform vec3 uPrimaryColor;
  uniform vec3 uAccentColor;
  uniform float uSaturation;

  varying vec2 vAtlasUv;
  varying float vGlowAlpha;
  varying float vColorMix;

  vec3 boostSat(vec3 c, float sat) {
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    return max(mix(vec3(luma), c, sat), vec3(0.0));
  }

  void main() {
    if (vGlowAlpha <= 0.002) discard;

    vec4 tex = texture2D(uAtlas, vAtlasUv);
    float mask = tex.a;
    if (mask <= 0.01) discard;

    // Select harmonious color blend from live Core palette
    vec3 tint;
    if (vColorMix < 0.5) {
      tint = mix(uDeepColor, uPrimaryColor, vColorMix * 2.0);
    } else {
      tint = mix(uPrimaryColor, uAccentColor, (vColorMix - 0.5) * 2.0);
    }
    tint = boostSat(tint, clamp(uSaturation, 0.75, 1.65));

    // Crisp luminous white-hot filament core + refined neon outer halo
    float coreLine = smoothstep(0.46, 0.90, mask);
    vec3 glowColor = mix(tint * 1.55, vec3(1.0, 0.99, 1.0) * 1.38 + tint * 0.58, coreLine * 0.68);

    float intensity = vGlowAlpha * (0.95 + coreLine * 0.76);
    gl_FragColor = vec4(glowColor * intensity, mask * clamp(vGlowAlpha, 0.0, 1.0));
  }
`;

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/**
 * Draws a single clean e-commerce / TikTok Shop / online-shop vector glyph
 * centered at (0, 0) in a normalized [-68..68] coordinate space.
 */
function traceEcommerceGlyph(ctx: CanvasRenderingContext2D, index: number): void {
  switch (index) {
    case 0: {
      // TikTok-inspired Music Note + Short Video Emblem
      ctx.beginPath();
      ctx.moveTo(10, -52);
      ctx.lineTo(10, 22);
      ctx.arc(-14, 24, 24, 0, Math.PI * 1.62, false);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(10, -52);
      ctx.bezierCurveTo(12, -26, 30, -16, 48, -16);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(20, -44);
      ctx.bezierCurveTo(23, -27, 35, -22, 47, -23);
      ctx.stroke();
      break;
    }

    case 1: {
      // TikTok Shop / E-Commerce Shopping Bag with centered Play spark
      ctx.beginPath();
      ctx.moveTo(-42, -20);
      ctx.lineTo(42, -20);
      ctx.lineTo(48, 44);
      ctx.quadraticCurveTo(48, 54, 38, 54);
      ctx.lineTo(-38, 54);
      ctx.quadraticCurveTo(-48, 54, -48, 44);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, -20, 22, Math.PI, 0, false);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-9, 6);
      ctx.lineTo(15, 19);
      ctx.lineTo(-9, 32);
      ctx.closePath();
      ctx.stroke();
      break;
    }

    case 2: {
      // Shopping Cart
      ctx.beginPath();
      ctx.moveTo(-54, -36);
      ctx.lineTo(-36, -36);
      ctx.lineTo(-22, 22);
      ctx.lineTo(38, 22);
      ctx.lineTo(50, -18);
      ctx.lineTo(-31, -18);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-26, 2);
      ctx.lineTo(43, 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(-14, 42, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(30, 42, 9, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 3: {
      // Online Shop Storefront with Awning
      ctx.beginPath();
      ctx.moveTo(-48, -16);
      ctx.lineTo(-38, -46);
      ctx.lineTo(38, -46);
      ctx.lineTo(48, -16);
      ctx.stroke();

      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.arc(k * 32, -16, 16, 0, Math.PI, false);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(-42, -2);
      ctx.lineTo(-42, 48);
      ctx.lineTo(42, 48);
      ctx.lineTo(42, -2);
      ctx.stroke();

      drawRoundedRectPath(ctx, -14, 14, 28, 34, 6);
      ctx.stroke();
      break;
    }

    case 4: {
      // Price / Flash Deal Tag
      ctx.beginPath();
      ctx.moveTo(-44, -44);
      ctx.lineTo(0, -44);
      ctx.lineTo(48, 4);
      ctx.lineTo(4, 48);
      ctx.lineTo(-44, 0);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(-22, -22, 8, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 5: {
      // Promo Discount Percent (%)
      ctx.beginPath();
      ctx.moveTo(-36, 40);
      ctx.lineTo(36, -40);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(-26, -26, 16, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(26, 26, 16, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 6: {
      // Live Shopping / Broadcast Stream Play
      ctx.beginPath();
      ctx.moveTo(-12, -20);
      ctx.lineTo(22, 0);
      ctx.lineTo(-12, 20);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 38, -Math.PI * 0.32, Math.PI * 0.32);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 38, Math.PI * 0.68, Math.PI * 1.32);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 54, -Math.PI * 0.28, Math.PI * 0.28);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 54, Math.PI * 0.72, Math.PI * 1.28);
      ctx.stroke();
      break;
    }

    case 7: {
      // 3D Isometric Shipping Parcel Box
      ctx.beginPath();
      ctx.moveTo(0, -52);
      ctx.lineTo(46, -26);
      ctx.lineTo(46, 26);
      ctx.lineTo(0, 52);
      ctx.lineTo(-46, 26);
      ctx.lineTo(-46, -26);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-46, -26);
      ctx.lineTo(0, 0);
      ctx.lineTo(46, -26);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 52);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-23, -39);
      ctx.lineTo(23, -13);
      ctx.stroke();
      break;
    }

    case 8: {
      // Express Delivery Truck
      drawRoundedRectPath(ctx, -48, -28, 58, 48, 6);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(10, -10);
      ctx.lineTo(34, -10);
      ctx.lineTo(48, 6);
      ctx.lineTo(48, 20);
      ctx.lineTo(10, 20);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(-26, 30, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(28, 30, 10, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-60, -12);
      ctx.lineTo(-52, -12);
      ctx.moveTo(-62, 4);
      ctx.lineTo(-52, 4);
      ctx.stroke();
      break;
    }

    case 9: {
      // Checkout Credit Card
      drawRoundedRectPath(ctx, -50, -34, 100, 68, 12);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-50, -12);
      ctx.lineTo(50, -12);
      ctx.stroke();

      drawRoundedRectPath(ctx, -34, 4, 22, 16, 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(4, 14);
      ctx.lineTo(34, 14);
      ctx.stroke();
      break;
    }

    case 10: {
      // Viral Engagement Heart
      ctx.beginPath();
      ctx.moveTo(0, 44);
      ctx.bezierCurveTo(-54, 10, -56, -42, -24, -44);
      ctx.bezierCurveTo(-9, -45, 0, -32, 0, -22);
      ctx.bezierCurveTo(0, -32, 9, -45, 24, -44);
      ctx.bezierCurveTo(56, -42, 54, 10, 0, 44);
      ctx.closePath();
      ctx.stroke();
      break;
    }

    case 11: {
      // Trending Sales / Viral GMV Upward Chart
      ctx.beginPath();
      ctx.moveTo(-48, 34);
      ctx.lineTo(-14, 0);
      ctx.lineTo(8, 18);
      ctx.lineTo(46, -32);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(22, -32);
      ctx.lineTo(46, -32);
      ctx.lineTo(46, -8);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-48, 46);
      ctx.lineTo(48, 46);
      ctx.stroke();
      break;
    }

    case 12: {
      // Flash Sale Lightning Bolt
      ctx.beginPath();
      ctx.moveTo(10, -52);
      ctx.lineTo(-34, 6);
      ctx.lineTo(2, 6);
      ctx.lineTo(-10, 52);
      ctx.lineTo(34, -6);
      ctx.lineTo(-2, -6);
      ctx.closePath();
      ctx.stroke();
      break;
    }

    case 13: {
      // Research Magnifying Glass (Loupe)
      ctx.beginPath();
      ctx.arc(-10, -10, 32, 0, Math.PI * 2);
      ctx.stroke();

      // Subtle inner lens glint arc
      ctx.beginPath();
      ctx.arc(-10, -10, 19, -Math.PI * 0.82, -Math.PI * 0.34, false);
      ctx.stroke();

      // Handle seamlessly joined to rim
      ctx.beginPath();
      ctx.moveTo(13, 13);
      ctx.lineTo(48, 48);
      ctx.stroke();
      break;
    }

    case 14: {
      // Affiliate Commission Coin ($)
      ctx.beginPath();
      ctx.arc(0, 0, 48, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(0, 32);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(16, -16);
      ctx.bezierCurveTo(16, -26, -16, -26, -16, -12);
      ctx.bezierCurveTo(-16, 0, 16, 0, 16, 12);
      ctx.bezierCurveTo(16, 26, -16, 26, -16, 16);
      ctx.stroke();
      break;
    }

    default: {
      // Gift / Voucher Box
      drawRoundedRectPath(ctx, -44, -14, 88, 22, 6);
      ctx.stroke();
      drawRoundedRectPath(ctx, -36, 8, 72, 40, 6);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(0, 48);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.bezierCurveTo(-24, -46, -42, -26, -16, -14);
      ctx.moveTo(0, -14);
      ctx.bezierCurveTo(24, -46, 42, -26, 16, -14);
      ctx.stroke();
      break;
    }
  }
}

function createEcommerceIconAtlasTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < ICON_COUNT; i++) {
      const col = i % ATLAS_GRID;
      const row = Math.floor(i / ATLAS_GRID);
      const cx = col * CELL_SIZE + CELL_SIZE * 0.5;
      const cy = row * CELL_SIZE + CELL_SIZE * 0.5;

      ctx.save();
      ctx.translate(cx, cy);
      // Clean balanced glyph proportion inside 256px cell (crisp & delicate, never bulky)
      ctx.scale(1.22, 1.22);

      // Pass 1: Soft luminous neon halo glow
      ctx.shadowColor = 'rgba(255, 255, 255, 0.95)';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 8.8;
      traceEcommerceGlyph(ctx, i);

      // Pass 2: Crisp bright inner line filament
      ctx.shadowBlur = 3;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4.8;
      traceEcommerceGlyph(ctx, i);

      ctx.restore();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function angularDistance(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/**
 * Builds 4 concentric orbital rotation layers of glowing TikTok Shop, Online Shop,
 * and E-commerce icons embedded directly inside the Core's rootGroup so they rotate,
 * tilt, squish, spin-up, and vanish in lockstep with the Core's 4 ring tiers.
 */
export function buildFloatingEcommerceIcons(
  scene: THREE.Scene,
  rootGroup: THREE.Group,
  quality: QualityProfile
): FloatingEcommerceIconsSystem {
  // Distribute orbital slots cleanly strictly inside the 4 concentric rotation tiers of the Core
  const layerCounts: readonly [number, number, number, number] = quality.isMobile
    ? [4, 6, 7, 8]
    : [5, 8, 9, 10];
  const slotCount = layerCounts[0] + layerCounts[1] + layerCounts[2] + layerCounts[3];
  const burstPoolCount = quality.isMobile ? 56 : 76;

  const group = new THREE.Group();
  group.name = 'CoreEcommerceRotationLayers';
  rootGroup.add(group);

  const burstGroup = new THREE.Group();
  burstGroup.name = 'CoreEcommerceBurstSpace';
  scene.add(burstGroup);

  const atlasTexture = createEcommerceIconAtlasTexture();

  // Shared live color uniforms so both orbital layers & burst-out icons stay 100% color-synced
  const sharedDeepColor = { value: new THREE.Color('#2532FF') };
  const sharedPrimaryColor = { value: new THREE.Color('#7A1BFF') };
  const sharedAccentColor = { value: new THREE.Color('#FF2EE8') };
  const sharedSaturation = { value: 1.28 };

  // 1) Embedded Orbital Rotation Layer InstancedMesh (inside rootGroup)
  const geom = new THREE.PlaneGeometry(1, 1);
  geom.rotateX(-Math.PI / 2);

  const cellIndexArray = new Float32Array(slotCount);
  const glowAlphaArray = new Float32Array(slotCount);
  const colorMixArray = new Float32Array(slotCount);

  const cellIndexAttr = new THREE.InstancedBufferAttribute(cellIndexArray, 1);
  const glowAlphaAttr = new THREE.InstancedBufferAttribute(glowAlphaArray, 1);
  const colorMixAttr = new THREE.InstancedBufferAttribute(colorMixArray, 1);
  cellIndexAttr.setUsage(THREE.DynamicDrawUsage);
  glowAlphaAttr.setUsage(THREE.DynamicDrawUsage);
  colorMixAttr.setUsage(THREE.DynamicDrawUsage);

  geom.setAttribute('aCellIndex', cellIndexAttr);
  geom.setAttribute('aGlowAlpha', glowAlphaAttr);
  geom.setAttribute('aColorMix', colorMixAttr);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlasTexture },
      uDeepColor: sharedDeepColor,
      uPrimaryColor: sharedPrimaryColor,
      uAccentColor: sharedAccentColor,
      uSaturation: sharedSaturation,
    },
    vertexShader: FLOATING_ICON_VERTEX,
    fragmentShader: FLOATING_ICON_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const instancedMesh = new THREE.InstancedMesh(geom, material, slotCount);
  instancedMesh.frustumCulled = false;
  instancedMesh.renderOrder = 10;
  group.add(instancedMesh);

  // 2) World-Space Centrifugal Burst InstancedMesh (flung outward into space on release)
  const burstGeom = new THREE.PlaneGeometry(1, 1);
  burstGeom.rotateX(-Math.PI / 2);

  const burstCellArray = new Float32Array(burstPoolCount);
  const burstGlowArray = new Float32Array(burstPoolCount);
  const burstColorArray = new Float32Array(burstPoolCount);

  const burstCellAttr = new THREE.InstancedBufferAttribute(burstCellArray, 1);
  const burstGlowAttr = new THREE.InstancedBufferAttribute(burstGlowArray, 1);
  const burstColorAttr = new THREE.InstancedBufferAttribute(burstColorArray, 1);
  burstCellAttr.setUsage(THREE.DynamicDrawUsage);
  burstGlowAttr.setUsage(THREE.DynamicDrawUsage);
  burstColorAttr.setUsage(THREE.DynamicDrawUsage);

  burstGeom.setAttribute('aCellIndex', burstCellAttr);
  burstGeom.setAttribute('aGlowAlpha', burstGlowAttr);
  burstGeom.setAttribute('aColorMix', burstColorAttr);

  const burstMesh = new THREE.InstancedMesh(burstGeom, material, burstPoolCount);
  burstMesh.frustumCulled = false;
  burstMesh.renderOrder = 9;
  burstGroup.add(burstMesh);

  const slots: OrbitalIconSlot[] = [];
  const burstSlots: BurstIconSlot[] = [];
  let burstWriteCursor = 0;
  let activeBurstCount = 0;
  let orbitalRegrow = 1.0;

  const dummy = new THREE.Object3D();
  const scratchLocal = new THREE.Vector3();

  for (let i = 0; i < burstPoolCount; i++) {
    burstSlots.push({
      active: false,
      age: 0,
      duration: 2,
      px: 0,
      py: -50,
      pz: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      drag: 1.4,
      rotY: 0,
      rotVel: 0,
      iconIndex: i % ICON_COUNT,
      baseScale: 0.42,
      colorMix: 0.5,
      peakGlow: 1.2,
      shimmerSpeed: 3.0,
      shimmerPhase: 0,
    });
    dummy.position.set(0, -50, 0);
    dummy.scale.setScalar(0.001);
    dummy.updateMatrix();
    burstMesh.setMatrixAt(i, dummy.matrix);
  }
  burstMesh.instanceMatrix.needsUpdate = true;
  burstGroup.visible = false;

  const pickOrbitalAngle = (layer: 0 | 1 | 2 | 3, excludeIndex: number): number => {
    let bestAngle = Math.random() * Math.PI * 2;
    let bestMinSep = -1;
    const desiredSep = layer === 0 ? 0.72 : layer === 1 ? 0.56 : 0.44;

    for (let attempt = 0; attempt < 8; attempt++) {
      const cand = Math.random() * Math.PI * 2;
      let minSep = Math.PI * 2;
      for (let j = 0; j < slots.length; j++) {
        if (j === excludeIndex || !slots[j].active || slots[j].layer !== layer) continue;
        const sep = angularDistance(cand, slots[j].angle);
        if (sep < minSep) minSep = sep;
      }
      if (minSep > bestMinSep) {
        bestMinSep = minSep;
        bestAngle = cand;
      }
      if (minSep >= desiredSep) break;
    }

    return bestAngle;
  };

  const respawnSlot = (slot: OrbitalIconSlot, index: number, startActive: boolean): void => {
    const cfg = ROTATION_LAYERS[slot.layer];
    slot.active = startActive;
    slot.age = 0;
    slot.duration = startActive
      ? 6.4 + Math.random() * 6.8
      : 0.85 + Math.random() * 2.8;
    slot.angle = pickOrbitalAngle(slot.layer, index);
    slot.radius = cfg.minRadius + Math.random() * (cfg.maxRadius - cfg.minRadius);
    slot.localY = cfg.yOffset + (Math.random() * 2 - 1) * 0.035;
    slot.driftMult = 0.7 + Math.random() * 0.6;
    slot.iconIndex = pickWeightedIconIndex();
    slot.baseScale = cfg.minScale + Math.random() * (cfg.maxScale - cfg.minScale);
    slot.swaySpeed = 0.65 + Math.random() * 0.65;
    slot.swayPhase = Math.random() * Math.PI * 2;
    slot.shimmerSpeed = 1.15 + Math.random() * 1.45;
    slot.shimmerPhase = Math.random() * Math.PI * 2;
    slot.colorMix = Math.random();
    slot.peakGlow = 0.92 + Math.random() * 0.65;
  };

  // Build and stagger slots across the 4 concentric rotation layers
  let runningIdx = 0;
  for (let layerIdx = 0; layerIdx < 4; layerIdx++) {
    const count = layerCounts[layerIdx];
    const layer = layerIdx as 0 | 1 | 2 | 3;
    for (let k = 0; k < count; k++) {
      const slot: OrbitalIconSlot = {
        layer,
        active: false,
        age: 0,
        duration: 1,
        angle: (k / count) * Math.PI * 2,
        radius: ROTATION_LAYERS[layer].minRadius,
        localY: ROTATION_LAYERS[layer].yOffset,
        driftMult: 1,
        iconIndex: runningIdx % ICON_COUNT,
        baseScale: ROTATION_LAYERS[layer].minScale,
        swaySpeed: 0.8,
        swayPhase: 0,
        shimmerSpeed: 1.5,
        shimmerPhase: 0,
        colorMix: 0.5,
        peakGlow: 0.9,
      };
      slots.push(slot);
      const startActive = k < Math.ceil(count * 0.78);
      respawnSlot(slot, runningIdx, startActive);
      slot.age = Math.random() * slot.duration * 0.85;
      runningIdx++;
    }
  }

  const spawnBurstIcon = (
    px: number,
    py: number,
    pz: number,
    angle: number,
    spinDir: number,
    iconIndex: number,
    baseScale: number,
    colorMix: number,
    burstPower: number
  ): void => {
    const b = burstSlots[burstWriteCursor];
    burstWriteCursor = (burstWriteCursor + 1) % burstPoolCount;

    const jitterAngle = angle + (Math.random() * 2 - 1) * 0.22;
    const rx = Math.cos(jitterAngle);
    const rz = Math.sin(jitterAngle);
    // Tangential centrifugal whip perpendicular to radius
    const tx = -rz * spinDir;
    const tz = rx * spinDir;

    const radialSpeed = (6.4 + Math.random() * 8.4) * (0.68 + burstPower * 0.78);
    const tangentSpeed = (2.6 + Math.random() * 4.2) * (0.58 + burstPower * 0.68);

    b.active = true;
    b.age = 0;
    b.duration = 1.7 + Math.random() * 1.45;
    b.px = px;
    b.py = py;
    b.pz = pz;
    b.vx = rx * radialSpeed + tx * tangentSpeed;
    b.vz = rz * radialSpeed + tz * tangentSpeed;
    b.vy = (-1.1 + Math.random() * 3.0) * (0.52 + burstPower * 0.65);
    b.drag = 1.05 + Math.random() * 0.68;
    b.rotY = -(jitterAngle + Math.PI * 0.5);
    b.rotVel = spinDir * (2.0 + Math.random() * 4.4) * (0.65 + burstPower * 0.55);
    b.iconIndex = iconIndex;
    b.baseScale = Math.max(0.3, Math.min(0.48, baseScale * (1.02 + burstPower * 0.14)));
    b.colorMix = colorMix;
    b.peakGlow = 1.2 + Math.random() * 0.58;
    b.shimmerSpeed = 3.4 + Math.random() * 3.0;
    b.shimmerPhase = Math.random() * Math.PI * 2;
  };

  /**
   * Launches glowing icons radially + tangentially out into space all around when the user
   * releases a long-press shrink-spin and the Core springs back open.
   */
  const triggerCentrifugalBurst = (
    burstPower: number,
    coreScale: number,
    coreRoot: THREE.Group,
    ringGroups: readonly [THREE.Group, THREE.Group, THREE.Group, THREE.Group]
  ): void => {
    const safePower = Math.max(0.35, Math.min(1.35, burstPower));
    const launchScale = Math.max(0.24, Math.min(1.0, coreScale));
    const rootQuat = coreRoot.quaternion;
    const rootPos = coreRoot.position;

    // 1) Fling every currently active icon right off the Core's 4 rotation layers
    let launched = 0;
    for (let i = 0; i < slotCount; i++) {
      const slot = slots[i];
      if (!slot.active) continue;

      const ringGroup = ringGroups[slot.layer];
      const worldAngle = slot.angle - ringGroup.rotation.y;
      const effectiveR = Math.max(0.22, slot.radius * ringGroup.scale.x * launchScale);
      const localY = (ringGroup.position.y + slot.localY) * launchScale;

      scratchLocal
        .set(Math.cos(worldAngle) * effectiveR, localY, Math.sin(worldAngle) * effectiveR)
        .applyQuaternion(rootQuat)
        .add(rootPos);

      const spinDir = slot.layer % 2 === 0 ? -1 : 1;
      spawnBurstIcon(
        scratchLocal.x,
        scratchLocal.y,
        scratchLocal.z,
        worldAngle,
        spinDir,
        slot.iconIndex,
        slot.baseScale,
        slot.colorMix,
        safePower
      );
      launched++;
    }

    // 2) Add rich 360-degree centrifugal spray icons bursting outward all around into space
    const targetBurstCount = Math.round(
      (quality.isMobile ? 24 : 34) + safePower * (quality.isMobile ? 16 : 22)
    );
    const extraCount = Math.max(12, targetBurstCount - launched);
    for (let k = 0; k < extraCount; k++) {
      const angle = (k / extraCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.38;
      const spawnR = (0.3 + Math.random() * 1.6) * launchScale;
      const localY = (-0.18 + Math.random() * 0.45) * launchScale;

      scratchLocal
        .set(Math.cos(angle) * spawnR, localY, Math.sin(angle) * spawnR)
        .applyQuaternion(rootQuat)
        .add(rootPos);

      spawnBurstIcon(
        scratchLocal.x,
        scratchLocal.y,
        scratchLocal.z,
        angle,
        k % 2 === 0 ? -1 : 1,
        pickWeightedIconIndex(),
        0.3 + Math.random() * 0.14,
        Math.random(),
        safePower
      );
    }

    // Briefly dip orbital layer icons so it feels like the rings literally flung them off, then regrow smoothly
    orbitalRegrow = 0.06;
    activeBurstCount = burstPoolCount;
    burstGroup.visible = true;
  };

  const syncColors = (
    deep: THREE.Color,
    primary: THREE.Color,
    accent: THREE.Color,
    saturation: number
  ) => {
    sharedDeepColor.value.copy(deep);
    sharedPrimaryColor.value.copy(primary);
    sharedAccentColor.value.copy(accent);
    sharedSaturation.value = saturation;
  };

  const update = (
    dt: number,
    elapsedTime: number,
    ringGroups: readonly [THREE.Group, THREE.Group, THREE.Group, THREE.Group],
    ringReveals: readonly [number, number, number, number],
    vanishFade: number,
    zoomFade: number,
    kineticEnergy: number,
    reducedMotion: boolean
  ) => {
    const motionScale = reducedMotion ? 0.25 : 1.0;

    // Smoothly regrow orbital layer icons back onto the Core after a centrifugal release burst
    if (orbitalRegrow < 1.0) {
      orbitalRegrow = THREE.MathUtils.damp(orbitalRegrow, 1.0, 2.25, dt);
      if (1.0 - orbitalRegrow < 0.002) {
        orbitalRegrow = 1.0;
      }
    }

    // 1) Update Embedded 4-Layer Orbital Icons (inside rootGroup)
    const globalFade = Math.max(0, Math.min(1, vanishFade * zoomFade * orbitalRegrow));
    group.visible = globalFade > 0.002;
    if (group.visible) {
      for (let i = 0; i < slotCount; i++) {
        const slot = slots[i];
        const cfg = ROTATION_LAYERS[slot.layer];
        const ringGroup = ringGroups[slot.layer];
        const layerReveal = ringReveals[slot.layer];

        slot.age += dt * (reducedMotion ? 0.45 : 1.0);

        if (slot.age >= slot.duration) {
          if (slot.active) {
            slot.active = false;
            slot.age = 0;
            slot.duration = 0.75 + Math.random() * 2.5;
          } else {
            respawnSlot(slot, i, true);
          }
        }

        if (!slot.active || layerReveal <= 0.002) {
          glowAlphaArray[i] = 0;
          dummy.position.set(0, -50, 0);
          dummy.scale.setScalar(0.001);
          dummy.updateMatrix();
          instancedMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }

        slot.angle += cfg.driftSpeed * slot.driftMult * dt * motionScale;

        const u = slot.age / slot.duration;
        const fadeIn = smoothstep(0.0, 0.22, u);
        const fadeOut = 1.0 - smoothstep(0.75, 1.0, u);
        const lifeEnvelope = fadeIn * fadeOut;

        const waveA =
          Math.sin(elapsedTime * slot.shimmerSpeed * motionScale + slot.shimmerPhase) * 0.5 + 0.5;
        const waveB =
          Math.sin(elapsedTime * slot.shimmerSpeed * 0.46 * motionScale + slot.shimmerPhase * 1.65) *
            0.5 +
          0.5;
        const shimmer = 0.22 + 0.78 * Math.pow(waveA * 0.68 + waveB * 0.32, 1.35);

        const kineticBoost = 1.0 + kineticEnergy * 0.32;
        const glowAlpha =
          lifeEnvelope * shimmer * slot.peakGlow * kineticBoost * layerReveal * globalFade;
        glowAlphaArray[i] = glowAlpha;
        cellIndexArray[i] = slot.iconIndex;
        colorMixArray[i] = slot.colorMix;

        const worldAngle = slot.angle - ringGroup.rotation.y;
        const effectiveRadius = slot.radius * ringGroup.scale.x;
        const x = Math.cos(worldAngle) * effectiveRadius;
        const z = Math.sin(worldAngle) * effectiveRadius;
        const bobY = Math.sin(elapsedTime * slot.swaySpeed * motionScale + slot.swayPhase) * 0.025;
        const y = ringGroup.position.y + slot.localY + bobY;

        const tangentialRotY = -(worldAngle + Math.PI * 0.5);
        const microSway =
          Math.sin(elapsedTime * slot.swaySpeed * 0.8 * motionScale + slot.swayPhase) *
          0.08 *
          motionScale;

        const sizeBreath = (0.76 + 0.24 * lifeEnvelope) * (0.93 + 0.13 * shimmer);
        const finalScale = slot.baseScale * sizeBreath;

        dummy.position.set(x, y, z);
        dummy.rotation.set(0, tangentialRotY + microSway, 0);
        dummy.scale.set(finalScale, 1, finalScale);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      cellIndexAttr.needsUpdate = true;
      glowAlphaAttr.needsUpdate = true;
      colorMixAttr.needsUpdate = true;
    }

    // 2) Update World-Space Centrifugal Burst Icons flying out into deep space and vanishing
    if (activeBurstCount > 0) {
      let alive = 0;
      const burstSpeedScale = reducedMotion ? 0.45 : 1.0;

      for (let i = 0; i < burstPoolCount; i++) {
        const b = burstSlots[i];
        if (!b.active) {
          burstGlowArray[i] = 0;
          continue;
        }

        b.age += dt;
        if (b.age >= b.duration) {
          b.active = false;
          burstGlowArray[i] = 0;
          dummy.position.set(0, -50, 0);
          dummy.scale.setScalar(0.001);
          dummy.updateMatrix();
          burstMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }

        alive++;
        const dragFactor = Math.exp(-b.drag * dt);
        b.vx *= dragFactor;
        b.vy *= Math.exp(-b.drag * 1.15 * dt);
        b.vz *= dragFactor;

        b.px += b.vx * dt * burstSpeedScale;
        b.py += b.vy * dt * burstSpeedScale;
        b.pz += b.vz * dt * burstSpeedScale;
        b.rotY += b.rotVel * dt * burstSpeedScale;
        b.rotVel *= Math.exp(-0.85 * dt);

        const u = b.age / b.duration;
        const launchFlare = smoothstep(0.0, 0.07, u);
        // Smooth long space dissolve out into the dark void
        const spaceFade = 1.0 - smoothstep(0.32, 1.0, u);
        const shimmer =
          0.62 + 0.38 * (Math.sin(b.age * b.shimmerSpeed + b.shimmerPhase) * 0.5 + 0.5);

        burstGlowArray[i] = launchFlare * spaceFade * shimmer * b.peakGlow * zoomFade;
        burstCellArray[i] = b.iconIndex;
        burstColorArray[i] = b.colorMix;

        // Swell slightly on launch, then dissolve gracefully into space
        const scaleCurve = (0.55 + 0.65 * smoothstep(0.0, 0.16, u)) * (1.0 - 0.52 * smoothstep(0.45, 1.0, u));
        const finalScale = b.baseScale * scaleCurve;

        dummy.position.set(b.px, b.py, b.pz);
        dummy.rotation.set(0, b.rotY, 0);
        dummy.scale.set(finalScale, 1, finalScale);
        dummy.updateMatrix();
        burstMesh.setMatrixAt(i, dummy.matrix);
      }

      activeBurstCount = alive;
      burstGroup.visible = alive > 0 && zoomFade > 0.002;
      burstMesh.instanceMatrix.needsUpdate = true;
      burstCellAttr.needsUpdate = true;
      burstGlowAttr.needsUpdate = true;
      burstColorAttr.needsUpdate = true;
    } else {
      burstGroup.visible = false;
    }
  };

  const dispose = () => {
    atlasTexture.dispose();
    geom.dispose();
    burstGeom.dispose();
    material.dispose();
    if (group.parent) {
      group.parent.remove(group);
    }
    if (burstGroup.parent) {
      burstGroup.parent.remove(burstGroup);
    }
  };

  return {
    group,
    syncColors,
    triggerCentrifugalBurst,
    update,
    dispose,
  };
}
