/**
 * Custom GLSL shaders for the SiamPick 3D Digital Intelligence Core.
 * Parameterized via live color uniforms (uDeepColor, uPrimaryColor, uAccentColor,
 * uSaturation, uCoreWhite) so color adjustments apply instantaneously at 60fps
 * without recompiling shaders or rebuilding geometry.
 */

const GLSL_COLOR_UTILS = /* glsl */ `
vec3 applySaturation(vec3 col, float sat) {
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  return max(vec3(0.0), mix(vec3(luma), col, sat));
}
`;

const GLSL_NOISE_3D = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

/**
 * 1. Central Living Digital Core Plasma Shader
 * High-contrast swirling ribbons (Deep Electric Blue -> Vivid Violet -> Neon Accent)
 * with calibrated Fresnel rim so the core shows deep internal motion without white blowout.
 */
export const CORE_PLASMA_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uKinetic;
uniform float uMaterialize;
uniform float uAwakenCharge;
uniform float uWhiteCore;
uniform float uImpactPulse;
uniform float uCentrifugal;
uniform float uSloshEnergy;
uniform vec2 uSloshDir;

varying vec3 vNormalDir;
varying vec3 vViewDir;
varying vec3 vLocalPos;
varying float vEnergy;
varying float vRibbon;

${GLSL_NOISE_3D}

void main() {
  vec3 p = position;
  float speedBoost = 1.0 + uAwakenCharge * 2.8;
  float n1 = snoise(p * 2.35 + vec3(uTime * 0.45 * speedBoost, -uTime * 0.35 * speedBoost, uTime * 0.28 * speedBoost));
  float n2 = snoise(p * 4.5 - vec3(uTime * 0.62 * speedBoost, uTime * 0.44 * speedBoost, -uTime * 0.5 * speedBoost));
  // As uWhiteCore -> 1.0, surface noise flattens into one perfectly smooth, tense pure white sphere
  float calmShell = 1.0 - smoothstep(0.45, 0.98, uWhiteCore);

  // Zero-gravity space water droplet capillary modes + rotational centrifugal flattening
  float theta = atan(p.z, p.x + 1e-5);
  float capWave =
    (sin(theta * 2.0 + uTime * 2.1) * 0.032 +
     cos(theta * 3.0 - uTime * 2.8 + p.y * 3.2) * 0.024) * (1.0 + uSloshEnergy * 1.65);
  float sloshBulge = dot(normalize(vec2(p.x, p.z) + vec2(1e-5)), uSloshDir) * 0.085 * calmShell;

  float displacement = ((n1 * 0.068 + n2 * 0.03) * (0.75 + uPulse * 0.25 + uKinetic * 0.35 + uAwakenCharge * 0.55 + uImpactPulse * 0.45 + uSloshEnergy * 0.45) + capWave + sloshBulge) * calmShell;
  vec3 displaced = p + normal * displacement;

  // Real rotational physics: centrifugal equatorial bulge + subtle polar flattening
  float eqExpand = 1.0 + uCentrifugal * 0.14 * calmShell;
  float poleFlatten = 1.0 - uCentrifugal * 0.12 * calmShell;
  displaced.x *= eqExpand;
  displaced.z *= eqExpand;
  displaced.y *= poleFlatten;

  vLocalPos = displaced;
  vEnergy = n1 * 0.5 + 0.5;
  vRibbon = abs(sin((n1 * 2.4 + n2 * 1.3 + p.y * 2.6 + uTime * (0.65 + uAwakenCharge * 2.1)) * 2.2));

  vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
  vNormalDir = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPos.xyz);

  gl_Position = projectionMatrix * mvPos;
}
`;

export const CORE_PLASMA_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uKinetic;
uniform float uMaterialize;
uniform float uSurge;
uniform float uAwakenCharge;
uniform float uWhiteCore;
uniform float uImpactPulse;
uniform float uCoreDominance;
uniform vec3 uDeepColor;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform float uSaturation;
uniform float uCoreWhite;

varying vec3 vNormalDir;
varying vec3 vViewDir;
varying vec3 vLocalPos;
varying float vEnergy;
varying float vRibbon;

${GLSL_COLOR_UTILS}

void main() {
  vec3 N = normalize(vNormalDir);
  vec3 V = normalize(vViewDir);
  float ndotv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndotv, 2.05);

  // Flowing energy ribbons across the spherical core surface
  float ribbonLine = smoothstep(0.76, 0.99, vRibbon);
  float bands = sin(vLocalPos.y * 22.0 + uTime * (2.0 + uAwakenCharge * 4.5)) * 0.5 + 0.5;
  float meridians = sin(atan(vLocalPos.z, vLocalPos.x + 1e-5) * 10.0 - uTime * (1.3 + uAwakenCharge * 5.2)) * 0.5 + 0.5;
  float microGrid = smoothstep(0.86, 0.99, bands) * 0.28 + smoothstep(0.90, 0.995, meridians) * 0.24;

  // Deep interior contrast prevents washed-out white core in normal idle state
  vec3 darkCore = uDeepColor * 0.28;
  vec3 baseCol = mix(darkCore, uDeepColor, smoothstep(0.12, 0.62, vEnergy));
  baseCol = mix(baseCol, uPrimaryColor, smoothstep(0.36, 0.85, vEnergy + ribbonLine * 0.35 + uAwakenCharge * 0.25));
  baseCol = mix(baseCol, uAccentColor, clamp(ribbonLine * 0.82 + uAwakenCharge * 0.22, 0.0, 1.0));

  vec3 hotHighlight = mix(uAccentColor, vec3(1.0), 0.65);

  float centerLift = pow(ndotv, 2.2) * (0.28 + uPulse * 0.14 + uAwakenCharge * 0.45) * max(0.35, uCoreWhite);
  vec3 color = baseCol * (0.78 + uPulse * 0.18 + uKinetic * 0.3 + uAwakenCharge * 0.62);
  color += uAccentColor * ribbonLine * (0.55 + uPulse * 0.18 + uAwakenCharge * 0.58);
  color += hotHighlight * centerLift * (0.72 + uSurge * 0.55 + uAwakenCharge * 0.52);
  color += mix(uPrimaryColor, uAccentColor, 0.62) * fresnel * (1.28 + uKinetic * 0.5 + uSurge * 0.45 + uAwakenCharge * 0.9);
  color += mix(uAccentColor, hotHighlight, 0.35) * microGrid * (0.48 + uAwakenCharge * 0.35);

  // Tactile luminous flash on every incoming wave impact
  color += mix(uAccentColor, vec3(1.0), 0.72) * uImpactPulse * (0.85 + fresnel * 0.75);

  color = applySaturation(color, uSaturation);

  // Stage 5: Intensely luminous pure white sphere compressed under tension
  float whiteBlend = smoothstep(0.05, 0.96, uWhiteCore);
  vec3 pureWhiteSphere = vec3(1.85, 1.88, 1.94) * (0.92 + 0.24 * pow(ndotv, 1.4) + 0.22 * fresnel);
  color = mix(color, pureWhiteSphere, whiteBlend);

  float alpha = clamp(max(uMaterialize * uCoreDominance, whiteBlend) * (0.90 + fresnel * 0.10), 0.0, 1.0);
  gl_FragColor = vec4(color * max(uMaterialize * uCoreDominance, whiteBlend), alpha);
}
`;

/**
 * 2. Equatorial Radial Singularity Spark & Volumetric Halo Shader
 */
export const CORE_HALO_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const CORE_HALO_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uSingularity;
uniform float uMaterialize;
uniform float uPulse;
uniform float uSurge;
uniform float uKinetic;
uniform float uOutwardWave;
uniform float uCircPhase;
uniform float uCircIntensity;
uniform float uAwakenCharge;
uniform float uWhiteCore;
uniform float uImpactPulse;
uniform float uCoreDominance;
uniform vec3 uDeepColor;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform float uSaturation;
uniform float uCoreWhite;

varying vec2 vUv;

${GLSL_COLOR_UTILS}

void main() {
  vec2 centered = (vUv - 0.5) * 2.0;
  float r = length(centered);
  if (r > 1.0) discard;

  float angle = atan(centered.y, centered.x + 1e-5);

  // Beat 2: Sharp central birth spark that gracefully hands off to the rich 3D Core in Beat 7
  float birthSparkFade = 1.0 - uMaterialize * (1.0 - uCoreWhite * 0.55);
  float sparkTight = exp(-r * r * mix(160.0, 28.0, uMaterialize)) * uSingularity * (birthSparkFade + uAwakenCharge * 0.42);
  float crossFlare =
    exp(-abs(centered.x) * 34.0) * exp(-r * 6.5) +
    exp(-abs(centered.y) * 34.0) * exp(-r * 6.5);
  float birthStar = crossFlare * uSingularity * (1.0 - uMaterialize * 0.84) * 0.55;

  // Ring-shaped volumetric aura peeking out around the 3D core
  float ringAura = exp(-pow((r - 0.22) / (0.17 + uAwakenCharge * 0.04), 2.0)) * (0.48 + uPulse * 0.14 + uKinetic * 0.24 + uAwakenCharge * 0.50) * uMaterialize;
  float outerAura = exp(-r * 2.35) * (0.20 + uSurge * 0.18 + uAwakenCharge * 0.22) * uMaterialize;

  float caustic = sin(angle * 6.0 - uTime * (0.9 + uAwakenCharge * 2.4) - uCircPhase * 1.6 + r * 8.0) * 0.5 + 0.5;
  float causticGlow = caustic * exp(-pow((r - 0.26) / 0.22, 2.0)) * (0.14 + abs(uCircIntensity) * 0.18 + uAwakenCharge * 0.24) * uMaterialize;

  // Helical circulation vortex ripple rings triggered during Zoom In (inward) / Zoom Out (outward)
  float circAmp = abs(uCircIntensity);
  float spiralWave = sin(r * 22.0 + uCircPhase * 3.8 + angle * 2.0) * 0.5 + 0.5;
  float circRipple = pow(spiralWave, 3.0) * smoothstep(0.14, 0.34, r) * smoothstep(0.95, 0.38, r) * circAmp * 0.36 * uMaterialize;

  // Beat 6: Outward expanding electromagnetic shockwave ring
  float waveRadius = uOutwardWave * 0.96;
  float waveWidth = 0.055;
  float waveIntensity = exp(-pow((r - waveRadius) / waveWidth, 2.0)) * sin(uOutwardWave * 3.14159265);
  float waveGlow = waveIntensity * 0.88;

  // Tactile impact flash around the central nucleus on every incoming wave strike
  float impactRing = exp(-pow((r - mix(0.32, 0.14, uImpactPulse)) / 0.065, 2.0)) * uImpactPulse * 1.05;
  float impactCore = exp(-r * r * 26.0) * uImpactPulse * 0.95;

  // Pure white compressed sphere corona during WHITE_CORE_STILLNESS
  float whiteCoreTight = exp(-r * r * 24.0) * uWhiteCore * 1.65;
  float whiteCoreHalo = exp(-r * r * 6.5) * uWhiteCore * 0.72;

  vec3 sparkCol = mix(uAccentColor, vec3(1.0), 0.72);

  vec3 col = vec3(0.0);
  col += sparkCol * (sparkTight * (0.95 + uSurge * 0.65) + birthStar);
  col += mix(uAccentColor, uPrimaryColor, smoothstep(0.14, 0.45, r)) * (ringAura + causticGlow) * (1.0 - uWhiteCore * 0.75);
  col += mix(uPrimaryColor, uDeepColor, smoothstep(0.28, 0.85, r)) * outerAura * (1.0 - uWhiteCore * 0.85);
  col += mix(uAccentColor, uPrimaryColor, 0.42) * circRipple;
  col += mix(uAccentColor, uDeepColor, 0.25) * waveGlow;
  col += mix(uAccentColor, vec3(1.0), 0.68) * (impactRing + impactCore);

  col = applySaturation(col, uSaturation);

  // Add pure white radiance AFTER saturation so compressed sphere is genuinely pure white
  col += vec3(1.35, 1.38, 1.44) * whiteCoreTight + vec3(0.95, 0.97, 1.0) * whiteCoreHalo;

  float dom = max(uCoreDominance, uWhiteCore);
  float edgeMask = smoothstep(1.0, 0.72, r) * dom;
  col *= edgeMask;

  float alpha = clamp((sparkTight + ringAura + outerAura + waveGlow + birthStar + circRipple + impactRing + impactCore + whiteCoreTight + whiteCoreHalo) * edgeMask, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * 3. Intricate Procedural Digital Circuit Lattice Disc Shader
 */
export const CIRCUIT_DISC_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vLocalPos;
void main() {
  vUv = uv;
  vLocalPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const CIRCUIT_DISC_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uReveal;
uniform float uOutwardWave;
uniform float uPulse;
uniform float uKinetic;
uniform float uCircPhase;
uniform float uCircIntensity;
uniform vec2 uPointerLocal;
uniform float uPointerInfluence;
uniform float uAwakenCharge;
uniform float uInternalCollapse;
uniform float uImpactPulse;
uniform float uCoreDominance;
uniform float uSpinSpeed;
uniform float uCentrifugal;
uniform float uSloshEnergy;
uniform vec2 uSloshDir;
uniform vec3 uDeepColor;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform float uSaturation;
uniform float uCoreWhite;

varying vec2 vUv;
varying vec3 vLocalPos;

${GLSL_COLOR_UTILS}
${GLSL_NOISE_3D}

void main() {
  vec2 p = vLocalPos.xy / 3.45;
  float rRaw = length(p);
  float angle = atan(p.y, p.x + 1e-5);

  // Living zero-gravity water droplet boundary contour (no rigid circular cut!)
  vec2 radDir = vec2(cos(angle), sin(angle));
  float capDeform =
    sin(angle * 2.0 + uTime * 1.35) * (0.048 + uSloshEnergy * 0.045) +
    cos(angle * 3.0 - uTime * 1.85) * (0.032 + uSloshEnergy * 0.035) +
    sin(angle * 4.0 + uTime * 2.25) * (0.018 + uSloshEnergy * 0.02) +
    dot(radDir, uSloshDir) * 0.095 +
    uCentrifugal * 0.08;

  // Coriolis spiral twist inside the fluid medium proportional to angular velocity
  float twistedAngle = angle - uSpinSpeed * 0.22 * rRaw;
  float r = (rRaw / (1.0 + capDeform)) * (1.0 + uInternalCollapse * 0.58);
  if (r < 0.16 || r > 1.06) discard;

  float revealEdge = mix(0.18, 1.08, uReveal);
  float revealMask = smoothstep(revealEdge + 0.08, revealEdge - 0.10, r) * smoothstep(0.0, 0.14, uReveal);
  if (revealMask <= 0.002) discard;

  // Flowing translucent space-droplet internal plasma caustics
  vec3 flowCoord = vec3(
    cos(twistedAngle) * r * 2.4,
    sin(twistedAngle) * r * 2.4,
    uTime * 0.32 + uCircPhase * 0.22
  );
  float nA = snoise(flowCoord);
  float nB = snoise(flowCoord * 2.1 - vec3(uTime * 0.28, -uTime * 0.22, uTime * 0.35));

  // Delicate swirling liquid-filament caustics inside the droplet interior
  float filamentA = pow(1.0 - abs(nA), 3.4);
  float filamentB = pow(1.0 - abs(nB), 4.2) * 0.72;
  float swirlRibbon = pow(
    0.5 + 0.5 * sin(r * 13.5 - twistedAngle * 2.0 - uTime * 1.4 - uCircPhase * 1.8 + nA * 2.8),
    3.6
  );

  // Soft outer liquid meniscus sheen hugging the organic deformed boundary
  float meniscus = exp(-pow((r - 0.86) / (0.11 + uSloshEnergy * 0.03), 2.0)) * (0.48 + filamentA * 0.52);

  float shockWave = exp(-pow((r - uOutwardWave) / 0.08, 2.0)) * sin(uOutwardWave * 3.14159265);
  float impactRipple = exp(-pow((r - mix(0.88, 0.24, uImpactPulse)) / 0.10, 2.0)) * uImpactPulse * 0.85;

  float pointerDist = length(p - uPointerLocal);
  float touchRipple = exp(-pointerDist * pointerDist * 5.0) * uPointerInfluence * (0.42 + 0.24 * sin(pointerDist * 18.0 - uTime * 7.5));

  float radialEnv = smoothstep(0.16, 0.34, r) * smoothstep(1.05, 0.78, r);
  float radialBlend = smoothstep(0.26, 0.92, r);

  vec3 deepLiquid = mix(uDeepColor, uPrimaryColor, 0.38 + radialBlend * 0.45);
  vec3 hotSheen = mix(uAccentColor, vec3(1.0), 0.52 * max(0.4, uCoreWhite));

  vec3 col = vec3(0.0);
  col += deepLiquid * (filamentA * 0.34 + swirlRibbon * 0.26);
  col += mix(uPrimaryColor, uAccentColor, 0.65) * (filamentB * 0.44 + meniscus * 0.55) * (0.85 + uPulse * 0.2 + uKinetic * 0.35 + uSloshEnergy * 0.35);
  col += hotSheen * (shockWave * 0.85 + impactRipple * 0.9 + touchRipple * 0.75);

  col = applySaturation(col, uSaturation);
  float dom = uCoreDominance;
  col *= (1.0 + uAwakenCharge * 0.48 + uImpactPulse * 0.42) * radialEnv * revealMask * dom;

  float alpha = clamp((filamentA * 0.24 + filamentB * 0.28 + swirlRibbon * 0.18 + meniscus * 0.42 + shockWave * 0.45 + impactRipple * 0.45 + touchRipple * 0.38) * radialEnv * revealMask * dom, 0.0, 0.85);
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * 4. Living Zero-Gravity Space-Droplet Plasma Boundary Membrane Shader
 *    Replaces rigid mechanical rings with living undulating water-droplet plasma waves
 *    driven by real rotational physics (centrifugal bulge, Coriolis shear twist, capillary slosh).
 */
export const ENERGY_RING_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uKinetic;
uniform float uSeed;
uniform float uInnerRadius;
uniform float uOuterRadius;
uniform float uSpinSpeed;
uniform float uCentrifugal;
uniform float uSloshEnergy;
uniform vec2 uSloshDir;

varying vec2 vUv;
varying vec3 vPos;
varying float vRn;
varying float vTheta;
varying float vWaveEnergy;

${GLSL_NOISE_3D}

void main() {
  vUv = uv;
  vec3 pos = position;
  float r0 = length(pos.xy);
  float rn = clamp((r0 - uInnerRadius) / max(0.0001, uOuterRadius - uInnerRadius), 0.0, 1.0);
  float theta = atan(pos.y, pos.x + 1e-5);
  vec2 radDir = vec2(cos(theta), sin(theta));

  // Real microgravity Rayleigh capillary surface-tension modes (modes 2, 3, 4, 5)
  float sloshAmp = 1.0 + uSloshEnergy * 2.15 + uKinetic * 0.55;
  float phaseSeed = uSeed * 19.7;
  float m2 = sin(theta * 2.0 + uTime * (1.28 + uSeed * 0.42) + phaseSeed) * 0.055;
  float m3 = cos(theta * 3.0 - uTime * (1.76 + uSeed * 0.55) + phaseSeed * 1.4) * 0.038;
  float m4 = sin(theta * 4.0 + uTime * (2.35 + uSeed * 0.64) - phaseSeed * 0.8) * 0.022;
  float n3 = snoise(vec3(radDir * (1.6 + uSeed), uTime * 0.48 + phaseSeed)) * 0.036;

  float radialDroplet = (m2 + m3 + m4 + n3) * sloshAmp;

  // Rotational Physics #1: Centrifugal outward radial expansion (F_c ~ omega^2 * r)
  float centrifugalStretch = uCentrifugal * (0.14 + 0.16 * rn) * (0.75 + uOuterRadius * 0.11);

  // Rotational Physics #2: Directional inertia slosh bulge when tilted / flicked
  float directionalSlosh = dot(radDir, uSloshDir) * (0.16 + 0.14 * rn);

  // Rotational Physics #3: Coriolis tangential shear twist lagging behind angular acceleration
  float coriolisTwist = -uSpinSpeed * (0.055 + 0.085 * rn) * (0.8 + uSeed * 0.35);
  float finalTheta = theta + coriolisTwist;

  float finalR = max(0.25, r0 * (1.0 + radialDroplet) + centrifugalStretch + directionalSlosh);
  pos.x = cos(finalTheta) * finalR;
  pos.y = sin(finalTheta) * finalR;

  // Organic 3D water-droplet surface ripple perpendicular to equatorial plane
  // (Flattens softly under high centrifugal spin just like a real spinning drop in space!)
  float zWave =
    (sin(theta * 2.0 - uTime * 1.55 + phaseSeed) * 0.085 +
     cos(theta * 3.0 + uTime * 2.1 - phaseSeed) * 0.052 +
     n3 * 0.9) * sloshAmp * (1.0 - uCentrifugal * 0.42) * (0.45 + 0.55 * sin(rn * 3.14159265));
  pos.z += zWave;

  vPos = pos;
  vRn = rn;
  vTheta = finalTheta;
  vWaveEnergy = clamp(abs(radialDroplet) * 3.2 + uSloshEnergy * 0.45 + uCentrifugal * 0.35, 0.0, 1.5);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const ENERGY_RING_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uReveal;
uniform float uPulse;
uniform float uKinetic;
uniform float uCircPhase;
uniform float uCircIntensity;
uniform float uMotionBlur;
uniform float uImpactPulse;
uniform float uCoreDominance;
uniform float uInnerRadius;
uniform float uOuterRadius;
uniform float uSegments;
uniform float uTicks;
uniform float uVioletMix;
uniform float uSeed;
uniform float uSpinSpeed;
uniform float uCentrifugal;
uniform float uSloshEnergy;
uniform vec3 uDeepColor;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform float uSaturation;
uniform float uCoreWhite;

varying vec2 vUv;
varying vec3 vPos;
varying float vRn;
varying float vTheta;
varying float vWaveEnergy;

${GLSL_COLOR_UTILS}

void main() {
  float rn = vRn;
  if (rn < 0.0 || rn > 1.0) discard;

  float normA = fract((vTheta + 3.14159265) / 6.2831853 + uSeed);
  float symA = abs(normA - 0.5) * 2.0;
  float revealEdge = smoothstep(uReveal + 0.06, uReveal - 0.05, symA) * smoothstep(0.0, 0.08, uReveal);
  if (revealEdge <= 0.002) discard;

  // Soft feathered radial envelope — ZERO rigid hard ring borders!
  float softEnv = smoothstep(0.0, 0.24, rn) * smoothstep(1.0, 0.72, rn);

  // 3 living, intertwining swirling plasma filaments weaving inside the liquid edge (Voicely Orb aesthetic!)
  float flowAdvect = uTime * (0.72 + uSeed * 0.35) + uCircPhase * 0.65 + uSpinSpeed * 0.25;
  float waveA = 0.50 + 0.24 * sin(vTheta * 2.0 - flowAdvect + uSeed * 6.2831);
  float waveB = 0.50 + 0.26 * cos(vTheta * 3.0 + flowAdvect * 0.85 - uSeed * 9.42);
  float waveC = 0.50 + 0.20 * sin(vTheta * 4.0 - flowAdvect * 1.25 + uSeed * 4.1);

  float ribbonWidth = 0.085 + uMotionBlur * 0.05 + uSloshEnergy * 0.025;
  float strandA = exp(-pow((rn - waveA) / ribbonWidth, 2.0));
  float strandB = exp(-pow((rn - waveB) / (ribbonWidth * 1.15), 2.0));
  float strandC = exp(-pow((rn - waveC) / (ribbonWidth * 0.9), 2.0));

  // Incandescent hot filament cores where living plasma waves weave and cross each other
  float hotA = exp(-pow((rn - waveA) / (ribbonWidth * 0.28), 2.0));
  float hotB = exp(-pow((rn - waveB) / (ribbonWidth * 0.32), 2.0));
  float crossingBoost = strandA * strandB * 1.35 + strandB * strandC * 0.95;

  // Soft liquid meniscus glow cushion
  float liquidGlow = exp(-pow((rn - 0.5) / 0.34, 2.0)) * (0.22 + 0.14 * sin(vTheta * 3.0 - flowAdvect));

  // Flowing rotational energy shimmer pulses
  float runner = 0.62 + 0.38 * cos(vTheta * 2.0 - uTime * (1.35 + uMotionBlur * 2.5) - uCircPhase * 1.4 + uSeed * 6.2831);
  float revealTip = exp(-pow((symA - uReveal) / 0.055, 2.0)) * (1.0 - smoothstep(0.92, 1.0, uReveal)) * smoothstep(0.0, 0.1, uReveal);

  vec3 primaryMix = mix(uPrimaryColor, uAccentColor, uVioletMix * 0.65);
  vec3 deepMix = mix(uDeepColor, uPrimaryColor, 0.58);
  vec3 hotCore = mix(uAccentColor, vec3(1.0), 0.58 + 0.28 * uCoreWhite);

  float boost = 0.86 + uPulse * 0.18 + uKinetic * 0.36 + uCentrifugal * 0.38 + uSloshEnergy * 0.34 + uMotionBlur * 0.42 + uImpactPulse * 0.52;

  vec3 col = vec3(0.0);
  col += deepMix * (liquidGlow + strandC * 0.58) * boost;
  col += primaryMix * (strandA * 0.86 + strandB * 0.72) * (0.85 + runner * 0.35) * boost;
  col += hotCore * (hotA * 0.62 + hotB * 0.48 + crossingBoost * 0.75 + revealTip * 1.2) * (0.9 + vWaveEnergy * 0.35);

  col = applySaturation(col, uSaturation);

  float intensity = (liquidGlow * 0.55 + strandA * 0.78 + strandB * 0.68 + strandC * 0.46 + crossingBoost * 0.55 + revealTip) * softEnv;
  float alpha = clamp(intensity * revealEdge * uCoreDominance * (0.76 + uPulse * 0.14 + uSloshEnergy * 0.12), 0.0, 0.94);

  gl_FragColor = vec4(col * softEnv * revealEdge * uCoreDominance, alpha);
}
`;

/**
 * 5. Converging Energy Lines Shader
 */
export const CONVERGE_LINES_VERTEX = /* glsl */ `
attribute float aRadialT;
attribute float aLineSeed;

varying float vRadialT;
varying float vLineSeed;

void main() {
  vRadialT = aRadialT;
  vLineSeed = aLineSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const CONVERGE_LINES_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uVisibility;
uniform float uFlow;
uniform float uIdleBlend;
uniform float uKinetic;
uniform float uAwakenCharge;
uniform float uCoreDominance;
uniform vec3 uDeepColor;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform float uSaturation;
uniform float uCoreWhite;

varying float vRadialT;
varying float vLineSeed;

${GLSL_COLOR_UTILS}

void main() {
  if (uVisibility <= 0.002) discard;

  float inwardPulse = fract(vRadialT + uTime * (0.78 - uIdleBlend * 0.42 + uAwakenCharge * 1.35) + vLineSeed);
  float head = smoothstep(0.0, 0.18, inwardPulse) * smoothstep(0.62, 0.18, inwardPulse);

  float birthHead = 1.0 - uFlow;
  float birthEnvelope = mix(smoothstep(birthHead - 0.18, birthHead + 0.12, vRadialT), 1.0, uIdleBlend);

  float baseLine = 0.16 * (1.0 - uIdleBlend * 0.45) + uAwakenCharge * 0.22;
  float stream = head * (0.95 - uIdleBlend * 0.35 + uKinetic * 0.45 + uAwakenCharge * 0.85);

  float endsFade = smoothstep(0.04, 0.18, vRadialT) * smoothstep(1.0, 0.72, vRadialT);

  vec3 col = mix(uAccentColor, mix(uPrimaryColor, uDeepColor, fract(vLineSeed * 7.3)), vRadialT * 0.8);
  col += mix(uAccentColor, vec3(1.0), 0.55 * uCoreWhite) * head * (0.42 + uAwakenCharge * 0.45) * (1.0 - uIdleBlend * 0.55 + uAwakenCharge * 0.55);
  col = applySaturation(col, uSaturation);

  float alpha = clamp((baseLine + stream) * endsFade * birthEnvelope * uVisibility * uCoreDominance, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

/**
 * 6. GPU-Animated Circulating Energy Particles Shader
 */
export const PARTICLES_VERTEX = /* glsl */ `
attribute float aAngle;
attribute float aRadius;
attribute float aHeight;
attribute float aSpeed;
attribute float aSize;
attribute float aPhase;
attribute float aColorMix;

uniform float uTime;
uniform float uPixelRatio;
uniform float uVisibility;
uniform float uGather;
uniform float uKinetic;
uniform float uPulse;
uniform float uOutwardWave;
uniform float uCircPhase;
uniform float uCircIntensity;
uniform float uWaveActivity;
uniform float uWaveCycle;
uniform float uWaveOrbitPhase;
uniform float uImpactPulse;
uniform float uWhiteCore;
uniform float uExplosion;
uniform float uInternalSpin;

varying float vColorMix;
varying float vAlpha;

void main() {
  float isExternal = smoothstep(1.9, 2.7, aRadius);
  float zoomSwirl = 1.65 / (0.65 + aRadius * 0.45);
  float angSpeed = aSpeed * (1.0 + uGather * 1.45 + uKinetic * 0.65);

  // Internal particles rotate rapidly with internal collapse; external particles orbit around the rim
  float orbitSpin = mix(uInternalSpin * 0.65, uWaveOrbitPhase * (0.85 + 0.35 * aPhase), isExternal);
  // Violent reverse rotational kick during REVERSE_EXPLOSION
  float explosionSpin = -uExplosion * (4.2 + aPhase * 3.8);
  float theta = aAngle + uTime * angSpeed + uCircPhase * zoomSwirl + orbitSpin + explosionSpin;

  float gatheredRadius = mix(aRadius, 0.36 + aPhase * 0.48, uGather * 0.84);

  // Pre-ignition: external particles sweep onto coin-rim-like circular orbital belt (r ~ 3.2..4.4),
  // then strike inward in distinct rhythmic bursts on each impact beat!
  float rimBelt = 3.18 + aPhase * 1.15;
  float rimHerded = mix(gatheredRadius, rimBelt, uWaveActivity * 0.58 * isExternal * (1.0 - uExplosion));
  float strikeRider = smoothstep(0.35, 0.92, sin(aPhase * 12.56637 + uWaveCycle * 6.28318) * 0.5 + 0.5);
  float strikePlunge = uImpactPulse * strikeRider * smoothstep(0.65, 4.2, rimHerded) * 1.85 * (1.0 - uExplosion);

  // Compress toward nucleus as White Core forms
  float compressedR = mix(max(0.28, rimHerded - strikePlunge), 0.18 + aPhase * 0.45, smoothstep(0.2, 0.95, uWhiteCore));

  // Sudden violent outward explosion across the entire viewport (NO gradual fade)
  float blastR = mix(compressedR, 0.45 + uExplosion * (8.8 + aPhase * 7.2), step(0.001, uExplosion));

  float waveKick = exp(-pow((aRadius / 4.8 - uOutwardWave) / 0.12, 2.0)) * sin(uOutwardWave * 3.14159265) * 0.38;
  float radialBreathing = sin(uTime * 1.1 + aPhase * 6.2831853) * 0.08 * (1.0 - uGather * 0.6) * (1.0 - uWhiteCore);
  float circRadialPull = -uCircIntensity * (0.28 + 0.16 * sin(aPhase * 6.2831853 + uCircPhase * 2.0)) * smoothstep(0.6, 3.6, aRadius);
  float r = max(0.16, blastR + (waveKick + radialBreathing + circRadialPull) * (1.0 - step(0.001, uExplosion)));

  // External particles follow coin-rim-like tilted 3D orbital waves (while Core stays flat & steady!)
  float funnelLift = uCircIntensity * (0.34 - aRadius * 0.06) * (0.5 + aPhase * 0.5);
  float coinRimOrbitY = sin(theta - uWaveOrbitPhase * 1.35 + aPhase * 6.2831853) * 0.62 * uWaveActivity * isExternal * (1.0 - uWhiteCore) * (1.0 - uExplosion);
  float blastY = (aPhase - 0.5) * 3.8 * uExplosion;
  float y = mix(
    aHeight * (1.0 - uGather * 0.65) + sin(uTime * 0.95 + aPhase * 6.2831853) * 0.14 + funnelLift + coinRimOrbitY,
    0.0,
    smoothstep(0.3, 0.95, uWhiteCore) * (1.0 - step(0.001, uExplosion))
  ) + blastY;

  vec3 pos = vec3(cos(theta) * r, y, sin(theta) * r);
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  gl_Position = projectionMatrix * mvPosition;

  float twinkle = 0.68 + 0.32 * sin(uTime * 2.1 + aPhase * 19.3);
  float pointSize = aSize * (0.85 + uPulse * 0.15 + waveKick * 1.1 + abs(uCircIntensity) * 0.25 + uImpactPulse * strikeRider * 0.45 + uExplosion * 1.15) * uPixelRatio * (18.0 / max(1.5, -mvPosition.z));
  gl_PointSize = clamp(pointSize, 1.5, 42.0);

  vColorMix = mix(aColorMix, 1.0, uWhiteCore * 0.65 + uExplosion * 0.35);
  // Hide scattered particles inside pure white stillness, then explode blindingly bright!
  float stillnessCull = 1.0 - smoothstep(0.55, 0.96, uWhiteCore) * (1.0 - step(0.001, uExplosion));
  vAlpha = uVisibility * twinkle * (0.64 + uGather * 0.35 + uImpactPulse * strikeRider * 0.28 + uExplosion * 0.65) * stillnessCull;
}
`;

export const PARTICLES_FRAGMENT = /* glsl */ `
uniform vec3 uDeepColor;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform float uSaturation;
uniform float uCoreWhite;

varying float vColorMix;
varying float vAlpha;

${GLSL_COLOR_UTILS}

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;

  float core = smoothstep(0.5, 0.0, d);
  float hot = pow(core, 3.0);

  vec3 tint = vColorMix < 0.48
    ? mix(uDeepColor, uPrimaryColor, vColorMix / 0.48)
    : mix(uPrimaryColor, uAccentColor, (vColorMix - 0.48) / 0.52);

  vec3 col = tint * core + mix(tint, vec3(1.0), 0.65 * uCoreWhite) * hot * 0.55;
  col = applySaturation(col, uSaturation);

  float alpha = core * vAlpha;
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * 7. Deep Radial Energy Substrate Grid
 */
export const SUBSTRATE_VERTEX = /* glsl */ `
varying vec3 vLocalPos;
void main() {
  vLocalPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SUBSTRATE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uReveal;
uniform float uPulse;
uniform float uCoreDominance;
uniform vec3 uDeepColor;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform float uSaturation;

varying vec3 vLocalPos;

${GLSL_COLOR_UTILS}

void main() {
  vec2 p = vLocalPos.xy / 6.8;
  float r = length(p);
  if (r > 1.0) discard;

  float angle = atan(p.y, p.x + 1e-5);

  float ring = smoothstep(0.045, 0.008, abs(fract(r * 7.0) - 0.5));
  float spokes = smoothstep(0.015 / max(r, 0.15), 0.003 / max(r, 0.15), abs(sin(angle * 8.0)));

  float underGlow = exp(-r * r * 5.2) * (0.14 + uPulse * 0.04);

  float fade = smoothstep(1.0, 0.32, r) * smoothstep(0.06, 0.22, r);

  vec3 col = mix(uDeepColor, uPrimaryColor, r * 0.65) * (ring * 0.22 + spokes * 0.09) * fade;
  col += mix(uPrimaryColor, uAccentColor, 0.32) * underGlow;
  col = applySaturation(col, uSaturation);

  float dom = mix(0.28, 1.0, uCoreDominance);
  float alpha = clamp(((ring * 0.22 + spokes * 0.09) * fade + underGlow) * uReveal * dom, 0.0, 1.0);
  gl_FragColor = vec4(col * uReveal * dom, alpha);
}
`;

/**
 * 8. Interlocking 3D Luminous Energy Ribbons wrapping the Core
 */
export const CORE_RIBBON_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uKinetic;
uniform float uSeed;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPos;

void main() {
  vUv = uv;
  float wave = sin(uv.x * 18.8495559 - uTime * (1.8 + uSeed * 0.7) + uSeed * 12.566) * (0.008 + uPulse * 0.004 + uKinetic * 0.006);
  vec3 displaced = position + normal * wave;

  vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
  vViewPos = -mvPos.xyz;
  vNormal = normalize(normalMatrix * normal);

  gl_Position = projectionMatrix * mvPos;
}
`;

export const CORE_RIBBON_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uUnfold;
uniform float uPulse;
uniform float uKinetic;
uniform float uCircPhase;
uniform float uCircIntensity;
uniform float uMotionBlur;
uniform float uCoreDominance;
uniform float uSeed;
uniform vec3 uDeepColor;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform float uSaturation;
uniform float uCoreWhite;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPos;

${GLSL_COLOR_UTILS}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewPos);
  float ndotv = abs(dot(N, V));
  float fresnel = pow(1.0 - ndotv, 1.75);
  float coreTube = pow(ndotv, 0.65);

  float loopT = vUv.x;
  float dir = uSeed > 0.45 ? 1.0 : -1.0;

  // Dual flowing plasma streams along the 3D orbital torus (accelerated smoothly by zoom circulation)
  float headA = fract(loopT * 2.0 - dir * (uTime * (0.32 + uSeed * 0.14 + uMotionBlur * 1.1) + uCircPhase * 0.38) + uSeed);
  float streamA = smoothstep(0.0, 0.78, headA) * smoothstep(1.0, 0.86, headA);
  float cometA = mix(pow(streamA, 1.65), 0.75 + 0.25 * streamA, uMotionBlur * 0.85);

  float headB = fract(loopT * 3.0 + dir * (uTime * (0.21 + uSeed * 0.09 + uMotionBlur * 0.8) + uCircPhase * 0.28) + uSeed * 2.7);
  float streamB = smoothstep(0.15, 0.82, headB) * smoothstep(1.0, 0.88, headB);
  float cometB = pow(streamB, 2.2) * 0.75;

  // Fine shimmering harmonic modulation along the silk ribbon
  float shimmer = 0.72 + 0.28 * sin(loopT * 37.6991 - dir * uTime * 3.2 - uCircPhase * 3.5 + uSeed * 9.0);

  // Subtle continuous orbital trace so the 3D weave always reads cleanly
  float baseTrack = 0.24 + 0.14 * shimmer + uMotionBlur * 0.35;
  float energy = (baseTrack + cometA * 1.15 + cometB * 0.85) * (0.82 + uPulse * 0.24 + uKinetic * 0.42 + abs(uCircIntensity) * 0.35 + uMotionBlur * 0.55);

  float colorWave = 0.5 + 0.5 * sin(loopT * 6.2831853 * 2.0 - uTime * 0.9 - uCircPhase * 1.2 + uSeed * 6.2831853);
  vec3 ribbonCol = mix(uDeepColor, uPrimaryColor, smoothstep(0.05, 0.65, colorWave));
  ribbonCol = mix(ribbonCol, uAccentColor, clamp(cometA * 0.78 + fresnel * 0.48, 0.0, 1.0));

  vec3 col = ribbonCol * energy * (0.55 + coreTube * 0.55 + fresnel * 0.85);
  col += mix(uAccentColor, vec3(1.0), 0.72 * uCoreWhite) * pow(cometA, 3.2) * (0.42 + uKinetic * 0.35 + uMotionBlur * 0.4);
  col = applySaturation(col, uSaturation);

  float alpha = clamp((baseTrack * 0.65 + cometA * 0.82 + cometB * 0.52 + fresnel * 0.35) * uUnfold * uCoreDominance, 0.0, 0.96);
  gl_FragColor = vec4(col * uUnfold * uCoreDominance, alpha);
}
`;

/**
 * 9. Luminous Segmented Harmonic Optical Filament Ring (replaces opaque dark inner collar/stroke)
 */
export const HARMONIC_FILAMENT_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uReveal;
uniform float uPulse;
uniform float uKinetic;
uniform float uCircPhase;
uniform float uCircIntensity;
uniform float uMotionBlur;
uniform float uCoreDominance;
uniform float uSegments;
uniform float uSeed;
uniform float uMorphT;
uniform float uMorphFade;
uniform vec3 uDeepColor;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform float uSaturation;
uniform float uCoreWhite;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPos;

${GLSL_COLOR_UTILS}

void main() {
  float vis = uReveal * uCoreDominance * uMorphFade;
  if (vis <= 0.002) discard;

  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewPos);
  float ndotv = abs(dot(N, V));
  float fresnel = pow(1.0 - ndotv, 1.6);

  float loopT = fract(vUv.x + uSeed);
  float dir = uSeed > 0.5 ? 1.0 : -1.0;

  // Flowing silky liquid plasma ribbon (continuous luminous energy, zero rigid mechanical segments)
  float transitBoost = sin(clamp(uMorphT, 0.0, 1.0) * 3.14159265);
  float flowSpeedBoost = transitBoost * 2.4;
  float ribbonPulse = 0.62 + 0.38 * sin(loopT * 6.2831853 * 2.0 - dir * (uTime * (0.85 + uMotionBlur * 2.2 + flowSpeedBoost) + uCircPhase * 1.1) + uSeed * 6.2831);
  float runnerA = fract(loopT * 2.0 - dir * (uTime * (0.28 + uMotionBlur * 0.95 + flowSpeedBoost * 0.35) + uCircPhase * 0.34) + uSeed);
  float cometA = pow(smoothstep(0.0, 0.80, runnerA) * smoothstep(1.0, 0.86, runnerA), mix(2.0, 1.1, max(uMotionBlur, transitBoost * 0.65)));

  float runnerB = fract(loopT * 3.0 + dir * (uTime * (0.18 + uMotionBlur * 0.7) + uCircPhase * 0.24) + uSeed * 1.9);
  float cometB = pow(smoothstep(0.10, 0.84, runnerB) * smoothstep(1.0, 0.88, runnerB), 2.4) * 0.72;

  float baseGlow = 0.34 + ribbonPulse * 0.42 + uMotionBlur * 0.28 + transitBoost * 0.38;
  float energy = (baseGlow + cometA * 1.08 + cometB * 0.74) * (0.86 + uPulse * 0.22 + uKinetic * 0.40 + abs(uCircIntensity) * 0.35 + uMotionBlur * 0.55 + transitBoost * 0.52);

  // Silky tapered liquid tips only while the ribbon is actively unzipped in mid-flight (0 < uMorphT < 1)
  float tipMask = smoothstep(0.0, 0.085, vUv.x) * smoothstep(1.0, 0.915, vUv.x);
  float endTaper = mix(1.0, tipMask, transitBoost);

  float tintWave = 0.5 + 0.5 * sin(loopT * 6.2831853 * 3.0 - uTime * 0.85 + uSeed * 6.2831853);
  vec3 col = mix(uPrimaryColor, uAccentColor, smoothstep(0.12, 0.88, tintWave) * 0.78 + cometA * 0.32 + transitBoost * 0.16);
  col = mix(uDeepColor, col, 0.74 + ribbonPulse * 0.26);
  col *= energy * (0.58 + ndotv * 0.46 + fresnel * 0.85);
  col += mix(uAccentColor, vec3(1.0), 0.74 * max(0.45, uCoreWhite)) * (pow(cometA, 2.5) * 0.65 + fresnel * 0.28 + transitBoost * 0.22);
  col = applySaturation(col, uSaturation);

  float alpha = clamp((baseGlow * 0.66 + cometA * 0.84 + cometB * 0.52 + fresnel * 0.35) * vis * endTaper, 0.0, 0.96);
  gl_FragColor = vec4(col * vis * endTaper, alpha);
}
`;

/**
 * 9B. Living 3D Space-Droplet Plasma Loop Vertex Shader (Orb-Style Swirling Outer Edge)
 *     - When uMorphT == 0: living organic space-droplet edge driven by rotational fluid physics.
 *     - When uMorphT 0 -> 1: the EXACT expanding Main Core light strand unzips cleanly at uv.x = 1,
 *       streams outward like a curved glowing river of water, and physically coils around its
 *       assigned Orb's exact 3D world coordinates & radius!
 */
export const LIQUID_ORB_RIBBON_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPulse;
uniform float uKinetic;
uniform float uSeed;
uniform float uSpinSpeed;
uniform float uCentrifugal;
uniform float uSloshEnergy;
uniform vec2 uSloshDir;
uniform float uBaseTube;
uniform float uMorphT;
uniform vec3 uOrbTargetWorld;
uniform float uOrbTargetRadius;
uniform vec2 uCardHalfSize;
uniform float uSpinDir;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPos;

${GLSL_NOISE_3D}

void main() {
  vUv = uv;
  vec3 pos = position;

  // Compute radial direction in equatorial XZ plane (torus lies in XZ plane)
  float rXZ = length(pos.xz);
  float theta = atan(pos.z, pos.x + 1e-5);
  vec2 radXZ = rXZ > 0.0001 ? (pos.xz / rXZ) : vec2(1.0, 0.0);

  // Zero-gravity water droplet capillary oscillations (modes 2, 3, 4 + 3D simplex ripple)
  float sloshAmp = 1.0 + uSloshEnergy * 2.25 + uKinetic * 0.52;
  float pSeed = uSeed * 21.3;
  float m2 = sin(theta * 2.0 + uTime * (1.35 + uSeed * 0.48) + pSeed) * 0.062;
  float m3 = cos(theta * 3.0 - uTime * (1.92 + uSeed * 0.55) + pSeed * 1.3) * 0.044;
  float m4 = sin(theta * 4.0 + uTime * (2.52 + uSeed * 0.62) - pSeed * 0.7) * 0.026;
  float n3 = snoise(vec3(radXZ * (1.45 + uSeed * 0.5), uTime * 0.52 + pSeed)) * 0.045;

  float radialWave = (m2 + m3 + m4 + n3) * sloshAmp;

  // Rotational Physics #1: Centrifugal radial expansion proportional to omega^2
  float centrifugalBulge = uCentrifugal * (0.20 + rXZ * 0.065);

  // Rotational Physics #2: Directional inertia slosh along tilt/drag vector
  float dirSlosh = dot(radXZ, uSloshDir) * (0.22 + rXZ * 0.055);

  // Rotational Physics #3: Coriolis tangential lag shear twisting the liquid loop
  float twist = -uSpinSpeed * (0.045 + rXZ * 0.028) * (0.75 + uSeed * 0.45);
  float finalTheta = theta + twist;

  float newR = max(0.3, rXZ * (1.0 + radialWave) + centrifugalBulge + dirSlosh);
  pos.x = cos(finalTheta) * newR;
  pos.z = sin(finalTheta) * newR;

  // Organic vertical liquid ripple (flattens smoothly as centrifugal spin rises)
  float yRipple =
    (sin(theta * 2.0 - uTime * 1.65 + pSeed) * 0.14 +
     cos(theta * 3.0 + uTime * 2.15 - pSeed) * 0.085 +
     n3 * 1.1) * sloshAmp * (1.0 - uCentrifugal * 0.45);
  pos.y = pos.y * (1.0 - uCentrifugal * 0.25) + yRipple;

  // Subtle breathing tube thickness pulsation
  float tubeBreath = sin(uv.x * 18.8495 - uTime * (2.1 + uSeed) + pSeed) * (0.008 + uSloshEnergy * 0.012);
  pos += normal * tubeBreath;

  if (uMorphT <= 0.0005) {
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vViewPos = -mvPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPos;
    return;
  }

  // =========================================================================
  // UNIFIED SINGLE-OBJECT METAMORPHOSIS (Main Core Expanding Ribbon -> Orb)
  // The exact expanding Core ribbon unzips at uv.x = 1 (head) -> uv.x = 0 (tail),
  // flows like a curved river of liquid light, and coils around its assigned Orb!
  // =========================================================================
  vec3 coreWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  vec3 tubeWorldOff = mat3(modelMatrix) * (normal * (uBaseTube + tubeBreath));
  vec3 coreWorldSpine = coreWorldPos - tubeWorldOff;

  // Staggered flow along arc uv.x (0 = tail still sliding off expanding Core, 1 = head coiling onto Orb)
  float s = uv.x;
  float stagger = 0.46;
  float localT = clamp((uMorphT * (1.0 + stagger) - (1.0 - s) * stagger), 0.0, 1.0);
  float easeT = localT * localT * (3.0 - 2.0 * localT);
  float midArc = sin(easeT * 3.14159265);

  // Target living rounded-rectangle Card border around uOrbTargetWorld on y = 0 plane
  // Superellipse (|x/hx|^6.25 + |z/hz|^6.25 = 1) matches rounded-2xl Image Card corners seamlessly!
  float destAng = atan(uOrbTargetWorld.z, uOrbTargetWorld.x + 1e-5);
  float coilSpin = (1.0 - easeT) * 2.4 * uSpinDir;
  float cardAngle = destAng + 1.5707963 * uSpinDir + s * 6.2831853 * uSpinDir + uTime * (0.58 + uSeed * 0.28) * uSpinDir - coilSpin;
  float ca = cos(cardAngle);
  float sa = sin(cardAngle);
  float sx = (ca >= 0.0 ? 1.0 : -1.0) * pow(max(0.0001, abs(ca)), 0.32);
  float sz = (sa >= 0.0 ? 1.0 : -1.0) * pow(max(0.0001, abs(sa)), 0.32);

  // Subtle living organic liquid ripple hugging the Card's 4 edges & rounded corners
  float edgeRipple =
    1.0 +
    sin(cardAngle * 3.0 + uTime * 1.85 + pSeed) * 0.022 +
    cos(cardAngle * 5.0 - uTime * 2.3 + pSeed * 1.2) * 0.014;
  float tightenPad = (1.02 + uSeed * 0.05) * edgeRipple * (1.0 + (1.0 - easeT) * 0.16);
  float hx = max(0.25, uCardHalfSize.x) * tightenPad;
  float hz = max(0.25, uCardHalfSize.y) * tightenPad;

  vec3 orbWorldSpine = vec3(
    uOrbTargetWorld.x + sx * hx,
    0.0,
    uOrbTargetWorld.z + sz * hz
  );

  // Smooth curved fluid-river trajectory bowing tangentially in the Core's spin direction
  vec2 toOrb = uOrbTargetWorld.xz;
  float distOrb = max(0.35, length(toOrb));
  vec2 dirOrb = toOrb / distOrb;
  vec2 perpOrb = vec2(-dirOrb.y, dirOrb.x) * uSpinDir;

  vec3 morphedSpine = mix(coreWorldSpine, orbWorldSpine, easeT);
  float riverBow = distOrb * (0.26 + uSeed * 0.16) * midArc;
  float riverWave = sin(s * 9.5 - uTime * 11.2 + pSeed) * (0.15 + distOrb * 0.028) * midArc;
  morphedSpine.xz += perpOrb * (riverBow + riverWave);
  morphedSpine.y *= (1.0 - easeT);

  // Smooth world-space circular tube cross-section (lush during river flow, crisp neon ribbon on Card border)
  float vAngle = uv.y * 6.2831853;
  float orbTubeR = max(0.015, min(hx, hz) * 0.048) * (1.0 + midArc * 0.65);
  vec2 cardOutXZ = normalize(vec2(sx / max(hx, 0.01), sz / max(hz, 0.01)) + vec2(1e-5, 0.0));
  vec3 orbRadDir = vec3(cardOutXZ.x, 0.0, cardOutXZ.y);
  vec3 orbTubeOff = (orbRadDir * cos(vAngle) + vec3(0.0, 1.0, 0.0) * sin(vAngle)) * orbTubeR;
  float coreTubeLen = max(0.008, length(tubeWorldOff));
  float targetTubeLen = mix(coreTubeLen, orbTubeR, easeT);
  vec3 coreTubeDir = tubeWorldOff / coreTubeLen;
  vec3 orbTubeDir = orbTubeOff / orbTubeR;
  vec3 rawTubeDir = mix(coreTubeDir, orbTubeDir, easeT);
  float rawLen = length(rawTubeDir);
  vec3 safeTubeDir = rawLen > 0.18 ? (rawTubeDir / rawLen) : orbTubeDir;
  vec3 finalTubeOff = safeTubeDir * targetTubeLen;

  vec3 finalWorldPos = morphedSpine + finalTubeOff;
  vec4 mvPos = viewMatrix * vec4(finalWorldPos, 1.0);
  vViewPos = -mvPos.xyz;
  vNormal = normalize(mat3(viewMatrix) * safeTubeDir);

  gl_Position = projectionMatrix * mvPos;
}
`;

/**
 * 10. GPU-Morphed External Space-Wide Coin-Rim Orbital Energy Waves & Reverse Explosion Trails
 *     - Pre-ignition: Large, sweeping light waves emerge from surrounding space, orbit around the
 *       Core's central nucleus along curved, tilted coin-rim-like circular paths while twisting,
 *       folding, and intertwining, then strike powerfully inward in rhythmic impact bursts.
 *       (Coin-rim orbital tilt applies ONLY to these external waves — NEVER to the Core itself.)
 *     - Reverse Explosion: Snaps in reverse direction and blasts violently outward across the viewport.
 */
export const HELIX_FILAMENTS_VERTEX = /* glsl */ `
attribute float aRadialT;
attribute float aSide;
attribute float aArmAngle;
attribute float aStrandSign;
attribute float aSeed;

uniform float uTime;
uniform float uVisibility;
uniform float uWaveCycle;
uniform float uWaveOrbitPhase;
uniform float uWaveTwistPhase;
uniform float uImpactPulse;
uniform float uWhiteCore;
uniform float uExplosion;
uniform float uExplosionIntensity;
uniform float uLayerSign;

varying float vRadialT;
varying float vSide;
varying float vStrandSign;
varying float vSeed;
varying float vBraidDepth;
varying float vStrikeZone;

vec3 evalExternalWavePoint(float t) {
  float env = sin(t * 3.14159265);

  // Rhythmic strike reach: 0 during gather/orbit -> 1 during forceful inward strike into nucleus
  float strikeReach = smoothstep(0.42, 0.66, uWaveCycle) * (1.0 - smoothstep(0.84, 1.0, uWaveCycle));
  float strikeBoost = max(strikeReach, uImpactPulse * 0.85);

  // PRE-IGNITION RADIAL PROFILE:
  // - t in [0.64..1.00]: sweeping inward from surrounding space (r ~ 3.55 .. 9.60)
  // - t in [0.22..0.64]: coin-rim-like circular orbital track around the Core circumference (r ~ 3.05 .. 3.55)
  // - t in [0.00..0.22]: inward strike plunge from rim right into the central nucleus on each beat!
  float rimShelfT = smoothstep(0.22, 0.64, t);
  float spaceTailT = smoothstep(0.64, 1.0, t);
  float innerStrikeT = smoothstep(0.0, 0.22, t);

  float rTip = mix(2.75, 0.24, strikeBoost);
  float rRimBase = mix(rTip, 3.12, pow(innerStrikeT, 0.88)) + rimShelfT * 0.48 + pow(spaceTailT, 1.25) * 6.0;

  // Folded wave undulations along the ribbon (zero tornado funnel)
  float foldR = sin(t * 9.424778 - uWaveTwistPhase * 1.45 + aSeed * 6.2831853) * (0.28 * env);
  float rPre = max(0.20, rRimBase + foldR);

  // Circumferential coin-rim orbital wrap: wraps almost 200 degrees around the Core before striking inward
  float rimWrapArc = smoothstep(0.10, 0.78, t) * 2.85 * uLayerSign;
  float foldTheta = sin(t * 7.85398 - uWaveTwistPhase * 1.15 + aSeed * 6.2831853) * (0.34 * env);
  float thetaPre = aArmAngle + rimWrapArc + foldTheta + uWaveOrbitPhase * (0.95 + 0.15 * uLayerSign);

  // REVERSE EXPLOSION: snap in opposite direction & shoot outward past viewport edges at extreme speed
  float isBlast = step(0.001, uExplosion);
  float rBlastInner = 0.25 + uExplosion * 3.8;
  float rBlastOuter = 1.60 + uExplosion * 14.8;
  float rBlast = mix(rBlastInner, rBlastOuter, t);
  float blastCurl = -t * 1.95 * uLayerSign + sin(t * 10.0 + aSeed * 6.2831853) * 0.22;
  float thetaBlast = aArmAngle + blastCurl + uWaveOrbitPhase * 1.15;

  float rBase = mix(rPre, rBlast, isBlast);
  float theta = mix(thetaPre, thetaBlast, isBlast);

  // Intertwined twin strands twisting and folding over each other
  float twistFreq = mix(16.0, 11.0, isBlast);
  float braidPhase = t * twistFreq + uWaveTwistPhase * 2.2 * uLayerSign + aSeed * 6.2831853;
  float rimAmpBoost = 1.0 + rimShelfT * 0.45 * (1.0 - spaceTailT);
  float braidAmp = (0.14 + 0.11 * env) * rimAmpBoost * (1.0 + isBlast * 0.95);

  float cosB = cos(braidPhase) * aStrandSign;
  float sinB = sin(braidPhase) * aStrandSign;

  vec2 radDir = vec2(cos(theta), sin(theta));
  vec2 tanDir = vec2(-sin(theta), cos(theta));
  vec2 xz = radDir * rBase + tanDir * (cosB * braidAmp);

  // COIN-RIM-LIKE TILTED 3D ORBITAL PLANE — APPLIED EXCLUSIVELY TO EXTERNAL WAVES (Core stays flat!)
  float orbitAxis = uWaveOrbitPhase * 1.42 + aArmAngle * 0.5 + aSeed * 6.2831853;
  float coinRimOrbitTilt = sin(theta - orbitAxis) * (0.48 + 0.24 * rimShelfT) * (1.0 - spaceTailT * 0.45) * (1.0 - isBlast);
  float waveFoldY = sin(t * 9.424778 - uWaveTwistPhase * 1.3 + aSeed * 6.2831853) * 0.22 * env * (1.0 - isBlast);
  float blastSpreadY = (aSeed - 0.5) * 2.2 * uExplosion * t;
  float y = sinB * braidAmp * 0.85 + coinRimOrbitTilt + waveFoldY + blastSpreadY + uLayerSign * 0.18;

  return vec3(xz.x, y, xz.y);
}

void main() {
  float t = aRadialT;
  float eps = 0.012;
  vec3 p0 = evalExternalWavePoint(t);
  vec3 pPrev = evalExternalWavePoint(max(0.0, t - eps));
  vec3 pNext = evalExternalWavePoint(min(1.0, t + eps));

  vec2 flowXZ = pNext.xz - pPrev.xz;
  float flowLen = length(flowXZ);
  vec2 tangentXZ = flowLen > 0.0001 ? (flowXZ / flowLen) : vec2(1.0, 0.0);
  vec2 ribbonPerp = vec2(-tangentXZ.y, tangentXZ.x);

  float isBlast = step(0.001, uExplosion);
  float taper = smoothstep(0.0, 0.10, t) * smoothstep(1.0, 0.80, t);
  float halfWidth = mix(0.052, 0.165, isBlast) * (0.72 + 0.52 * taper + uImpactPulse * 0.42);

  vec3 pos = vec3(
    p0.x + ribbonPerp.x * aSide * halfWidth,
    p0.y,
    p0.z + ribbonPerp.y * aSide * halfWidth
  );

  float twistFreq = mix(16.0, 11.0, isBlast);
  float braidPhase = t * twistFreq + uWaveTwistPhase * 2.2 * uLayerSign + aSeed * 6.2831853;

  vRadialT = t;
  vSide = aSide;
  vStrandSign = aStrandSign;
  vSeed = aSeed;
  vBraidDepth = sin(braidPhase) * aStrandSign * 0.5 + 0.5;
  vStrikeZone = 1.0 - smoothstep(0.0, 0.35, t);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const HELIX_FILAMENTS_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uVisibility;
uniform float uWaveCycle;
uniform float uWaveTwistPhase;
uniform float uImpactPulse;
uniform float uWhiteCore;
uniform float uExplosion;
uniform float uExplosionIntensity;
uniform vec3 uDeepColor;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform float uSaturation;
uniform float uCoreWhite;

varying float vRadialT;
varying float vSide;
varying float vStrandSign;
varying float vSeed;
varying float vBraidDepth;
varying float vStrikeZone;

${GLSL_COLOR_UTILS}

void main() {
  if (uVisibility <= 0.002) discard;

  float isBlast = step(0.001, uExplosion);
  float crossDist = abs(vSide);
  float sharpness = mix(5.2, 2.8, isBlast);
  float ribbonCore = exp(-crossDist * crossDist * sharpness);
  float hotCore = exp(-crossDist * crossDist * (sharpness * 3.2));

  float endsFade = smoothstep(0.0, 0.08, vRadialT) * smoothstep(1.0, 0.78, vRadialT);

  // Rhythmic Gather -> Coin-Rim Orbit -> Inward Strike wave packet
  // Packet travels smoothly from outer space (t=0.92) -> orbital rim (t=0.45) -> strike tip (t=0.05)
  float packetPos = mix(0.92, 0.04, clamp(uWaveCycle * 1.25, 0.0, 1.0));
  float mainPacket = exp(-pow((vRadialT - packetPos) / 0.19, 2.0));
  float rimOrbitGlow = exp(-pow((vRadialT - 0.44) / 0.24, 2.0)) * 0.58;
  float strikeFlash = vStrikeZone * uImpactPulse * 1.55;

  float preEnergy = 0.22 + rimOrbitGlow + mainPacket * 1.35 + strikeFlash;
  // Violent blazing explosion trails — stays at peak luminance all the way to instant blackout
  float blastEnergy = (1.45 + 0.95 * exp(-pow((vRadialT - 0.55) / 0.38, 2.0))) * uExplosionIntensity;

  float energy = mix(preEnergy, blastEnergy, isBlast) * (0.76 + 0.34 * vBraidDepth);

  // Live Color Studio theme adaptation (never hardcoded cyan/violet)
  vec3 strandHue = vStrandSign > 0.0
    ? mix(uPrimaryColor, uAccentColor, 0.48 + 0.42 * (1.0 - vRadialT))
    : mix(uDeepColor, uPrimaryColor, 0.45 + 0.45 * (1.0 - vRadialT));
  vec3 hotTip = mix(uAccentColor, vec3(1.0), 0.72 * max(0.45, uCoreWhite));

  vec3 col = strandHue * ribbonCore * energy;
  col += hotTip * hotCore * (0.28 + mainPacket * 0.75 + strikeFlash * 0.85 + isBlast * 1.45);
  col = applySaturation(col, uSaturation);

  // Blend slightly hotter toward white right at peak blast epicenter
  col += vec3(0.85, 0.88, 0.95) * hotCore * isBlast * 0.65;

  float alpha = clamp(ribbonCore * (0.36 + energy * 0.56) * endsFade * uVisibility, 0.0, 0.96);
  gl_FragColor = vec4(col * endsFade * uVisibility, alpha);
}
`;

/**
 * 11. External Coin-Rim Orbital Wave Halo, Rhythmic Impact Shockwave,
 *     Intense Pure White Sphere Corona & Violent Reverse Explosion Blast.
 *     (Zero tornado/whirlpool funnels; zero gradual fade-out before blackout.)
 */
export const AWAKENING_VORTEX_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const AWAKENING_VORTEX_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uCharging;
uniform float uWaveActivity;
uniform float uWaveCycle;
uniform float uWaveOrbitPhase;
uniform float uImpactPulse;
uniform float uWhiteCore;
uniform float uExplosion;
uniform float uExplosionIntensity;
uniform float uInternalSpin;
uniform vec3 uDeepColor;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform float uSaturation;
uniform float uCoreWhite;

varying vec2 vUv;

${GLSL_COLOR_UTILS}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float angle = atan(p.y, p.x + 1e-5);
  float psi = -angle;

  // Outer Core circumference sits at r = 3.35 / 9.25 = 0.3622
  const float ORBIT_R = 0.395;

  vec3 col = vec3(0.0);
  float totalAlpha = 0.0;
  float isBlast = step(0.001, uExplosion);

  // -------------------------------------------------------------------------
  // A. EXTERNAL COIN-RIM-LIKE ORBITAL LIGHT WAVES AROUND THE STABLE CORE
  // -------------------------------------------------------------------------
  float waveVis = uWaveActivity * (1.0 - uWhiteCore * 0.92) * (1.0 - isBlast);
  if (waveVis > 0.004) {
    // Sweeping orbital light waves circulating around the Core's rim (outside the Core, non-vortex)
    float orbitBand = exp(-pow((r - ORBIT_R) / 0.055, 2.0));
    float outerSweepR = mix(0.88, ORBIT_R, clamp(uWaveCycle * 1.45, 0.0, 1.0));
    float incomingWaveBand = exp(-pow((r - outerSweepR) / 0.068, 2.0)) * smoothstep(0.0, 0.14, uWaveCycle) * smoothstep(0.82, 0.45, uWaveCycle);

    // Dual racing orbital arcs following the coin-rim orbit phase
    float arcA = pow(0.5 + 0.5 * cos(psi * 2.0 - uWaveOrbitPhase * 1.15 + sin(r * 10.0) * 0.5), 2.4);
    float arcB = pow(0.5 + 0.5 * cos(psi * 3.0 - uWaveOrbitPhase * 1.48 - cos(r * 8.0) * 0.4), 3.0);

    float rimOrbital = orbitBand * (0.28 + arcA * 0.85 + arcB * 0.55) * waveVis;
    float approachArc = incomingWaveBand * (0.35 + arcA * 0.85) * waveVis;

    col += mix(uPrimaryColor, uAccentColor, 0.55) * rimOrbital * 0.92;
    col += mix(uDeepColor, uPrimaryColor, 0.68) * approachArc * 0.72;
    totalAlpha += clamp((rimOrbital * 0.62 + approachArc * 0.48), 0.0, 0.85);
  }

  // -------------------------------------------------------------------------
  // B. RHYTHMIC IMPACT SHOCKWAVE — TACTILE VISUAL FORCE ON EVERY STRIKE
  // -------------------------------------------------------------------------
  if (uImpactPulse > 0.004 && isBlast < 0.5) {
    // Sharp inward-striking shock ring + intense central impact flash
    float impactR = mix(0.36, 0.08, uImpactPulse);
    float shockRing = exp(-pow((r - impactR) / 0.042, 2.0)) * uImpactPulse;
    float centerStrike = exp(-r * r * 42.0) * uImpactPulse * 1.25;

    col += mix(uPrimaryColor, uAccentColor, 0.62) * shockRing * 1.15;
    col += mix(uAccentColor, vec3(1.0), 0.72) * (shockRing * 0.45 + centerStrike);
    totalAlpha += clamp(shockRing * 0.75 + centerStrike * 0.75, 0.0, 0.92);
  }

  // -------------------------------------------------------------------------
  // C. STAGE 5: INTENSELY LUMINOUS PURE WHITE SPHERE (STILLNESS UNDER TENSION)
  // -------------------------------------------------------------------------
  if (uWhiteCore > 0.01 && isBlast < 0.5) {
    float whiteCoreDisc = exp(-r * r * mix(65.0, 38.0, uWhiteCore)) * uWhiteCore * 1.55;
    float whiteCorona = exp(-r * r * 11.0) * uWhiteCore * 0.68;
    col = mix(col, vec3(0.0), smoothstep(0.55, 0.98, uWhiteCore) * 0.85);
    col += vec3(1.45, 1.48, 1.55) * whiteCoreDisc + vec3(0.92, 0.95, 1.0) * whiteCorona;
    totalAlpha = max(totalAlpha, clamp(whiteCoreDisc + whiteCorona, 0.0, 0.98));
  }

  // -------------------------------------------------------------------------
  // D. STAGE 6: SUDDEN VIOLENT REVERSE-DIRECTION EXPLOSION (NO FADE-OUT!)
  // -------------------------------------------------------------------------
  if (uExplosionIntensity > 0.004 && isBlast > 0.5) {
    // Extreme-speed expanding wavefronts shooting outward across the entire screen
    float front1 = mix(0.08, 1.18, uExplosion);
    float front2 = mix(0.04, 0.88, uExplosion);
    float front3 = mix(0.02, 0.58, uExplosion);

    // Reverse-rotating blazing energy spikes radiating from the detonating sphere
    float revStreaks = pow(0.5 + 0.5 * cos(psi * 12.0 - uWaveOrbitPhase * 1.35 + r * 8.0), 2.0);
    float revStreaksFine = pow(0.5 + 0.5 * sin(psi * 22.0 - uInternalSpin * 0.85 - r * 12.0), 3.0);

    float ring1 = exp(-pow((r - front1) / 0.11, 2.0)) * (0.75 + 0.45 * revStreaks);
    float ring2 = exp(-pow((r - front2) / 0.13, 2.0)) * (0.65 + 0.55 * revStreaksFine);
    float ring3 = exp(-pow((r - front3) / 0.14, 2.0)) * 0.85;

    // Blazing radial streak curtain behind the shockwave front
    float behindFront = smoothstep(front1 + 0.08, front1 - 0.18, r);
    float streakField = behindFront * (revStreaks * 0.68 + revStreaksFine * 0.52 + 0.25) * smoothstep(0.0, 0.16, r);
    float blastCore = exp(-r * r * mix(22.0, 5.5, uExplosion)) * 1.65;

    vec3 blastTheme = mix(uPrimaryColor, uAccentColor, 0.58);
    vec3 blastHot = mix(uAccentColor, vec3(1.0), 0.72);

    vec3 blastCol = vec3(0.0);
    blastCol += blastTheme * (ring1 * 1.45 + ring2 * 1.25 + streakField * 1.15);
    blastCol += mix(uDeepColor, uPrimaryColor, 0.65) * ring3 * 0.95;
    blastCol += blastHot * (ring1 * 0.75 + streakField * 0.55);
    blastCol = applySaturation(blastCol, uSaturation);
    blastCol += vec3(1.55, 1.58, 1.65) * (blastCore + ring1 * 0.35);

    col = blastCol * uExplosionIntensity;
    totalAlpha = clamp((ring1 + ring2 * 0.85 + ring3 * 0.7 + streakField * 0.85 + blastCore) * uExplosionIntensity, 0.0, 1.0);
  }

  if (totalAlpha <= 0.001) discard;

  if (isBlast < 0.5 && uWhiteCore < 0.65) {
    col = applySaturation(col, uSaturation);
  }

  // Keep full-screen coverage during violent explosion without circular clipping
  float edgeMask = mix(smoothstep(1.0, 0.82, r), 1.0, isBlast);
  gl_FragColor = vec4(col * edgeMask, clamp(totalAlpha * edgeMask, 0.0, 1.0));
}
`;



