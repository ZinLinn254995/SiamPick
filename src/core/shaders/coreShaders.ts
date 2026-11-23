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

varying vec3 vNormalDir;
varying vec3 vViewDir;
varying vec3 vLocalPos;
varying float vEnergy;
varying float vRibbon;

${GLSL_NOISE_3D}

void main() {
  vec3 p = position;
  float n1 = snoise(p * 2.35 + vec3(uTime * 0.45, -uTime * 0.35, uTime * 0.28));
  float n2 = snoise(p * 4.5 - vec3(uTime * 0.62, uTime * 0.44, -uTime * 0.5));
  float displacement = (n1 * 0.068 + n2 * 0.03) * (0.75 + uPulse * 0.25 + uKinetic * 0.35);
  vec3 displaced = p + normal * displacement;

  vLocalPos = displaced;
  vEnergy = n1 * 0.5 + 0.5;
  vRibbon = abs(sin((n1 * 2.4 + n2 * 1.3 + p.y * 2.6 + uTime * 0.65) * 2.2));

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
  float bands = sin(vLocalPos.y * 22.0 + uTime * 2.0) * 0.5 + 0.5;
  float meridians = sin(atan(vLocalPos.z, vLocalPos.x + 1e-5) * 10.0 - uTime * 1.3) * 0.5 + 0.5;
  float microGrid = smoothstep(0.86, 0.99, bands) * 0.28 + smoothstep(0.90, 0.995, meridians) * 0.24;

  // Deep interior contrast prevents washed-out white core
  vec3 darkCore = uDeepColor * 0.28;
  vec3 baseCol = mix(darkCore, uDeepColor, smoothstep(0.12, 0.62, vEnergy));
  baseCol = mix(baseCol, uPrimaryColor, smoothstep(0.36, 0.85, vEnergy + ribbonLine * 0.35));
  baseCol = mix(baseCol, uAccentColor, ribbonLine * 0.82);

  vec3 hotHighlight = mix(uAccentColor, vec3(1.0), 0.65);

  float centerLift = pow(ndotv, 2.2) * (0.28 + uPulse * 0.14) * uCoreWhite;
  vec3 color = baseCol * (0.78 + uPulse * 0.18 + uKinetic * 0.3);
  color += uAccentColor * ribbonLine * (0.55 + uPulse * 0.18);
  color += hotHighlight * centerLift * (0.72 + uSurge * 0.55);
  color += mix(uPrimaryColor, uAccentColor, 0.62) * fresnel * (1.28 + uKinetic * 0.5 + uSurge * 0.45);
  color += mix(uAccentColor, hotHighlight, 0.35) * microGrid * 0.48;

  color = applySaturation(color, uSaturation);

  float alpha = clamp(uMaterialize * (0.88 + fresnel * 0.12), 0.0, 1.0);
  gl_FragColor = vec4(color * uMaterialize, alpha);
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
  float sparkTight = exp(-r * r * mix(160.0, 28.0, uMaterialize)) * uSingularity * birthSparkFade;
  float crossFlare =
    exp(-abs(centered.x) * 34.0) * exp(-r * 6.5) +
    exp(-abs(centered.y) * 34.0) * exp(-r * 6.5);
  float birthStar = crossFlare * uSingularity * (1.0 - uMaterialize * 0.84) * 0.55;

  // Ring-shaped volumetric aura peeking out around the 3D core (keeps center deep & vivid)
  float ringAura = exp(-pow((r - 0.22) / 0.17, 2.0)) * (0.48 + uPulse * 0.14 + uKinetic * 0.24) * uMaterialize;
  float outerAura = exp(-r * 2.35) * (0.20 + uSurge * 0.18) * uMaterialize;

  float caustic = sin(angle * 6.0 - uTime * 0.9 - uCircPhase * 1.6 + r * 8.0) * 0.5 + 0.5;
  float causticGlow = caustic * exp(-pow((r - 0.26) / 0.22, 2.0)) * (0.14 + abs(uCircIntensity) * 0.18) * uMaterialize;

  // Helical circulation vortex ripple rings triggered during Zoom In (inward) / Zoom Out (outward)
  float circAmp = abs(uCircIntensity);
  float spiralWave = sin(r * 22.0 + uCircPhase * 3.8 + angle * 2.0) * 0.5 + 0.5;
  float circRipple = pow(spiralWave, 3.0) * smoothstep(0.14, 0.34, r) * smoothstep(0.95, 0.38, r) * circAmp * 0.36 * uMaterialize;

  // Beat 6: Outward expanding electromagnetic shockwave ring
  float waveRadius = uOutwardWave * 0.96;
  float waveWidth = 0.055;
  float waveIntensity = exp(-pow((r - waveRadius) / waveWidth, 2.0)) * sin(uOutwardWave * 3.14159265);
  float waveGlow = waveIntensity * 0.88;

  vec3 sparkCol = mix(uAccentColor, vec3(1.0), 0.72);

  vec3 col = vec3(0.0);
  col += sparkCol * (sparkTight * (0.95 + uSurge * 0.65) + birthStar);
  col += mix(uAccentColor, uPrimaryColor, smoothstep(0.14, 0.45, r)) * (ringAura + causticGlow);
  col += mix(uPrimaryColor, uDeepColor, smoothstep(0.28, 0.85, r)) * outerAura;
  col += mix(uAccentColor, uPrimaryColor, 0.42) * circRipple;
  col += mix(uAccentColor, uDeepColor, 0.25) * waveGlow;

  col = applySaturation(col, uSaturation);

  float edgeMask = smoothstep(1.0, 0.72, r);
  col *= edgeMask;

  float alpha = clamp((sparkTight + ringAura + outerAura + waveGlow + birthStar + circRipple) * edgeMask, 0.0, 1.0);
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
uniform vec3 uDeepColor;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform float uSaturation;
uniform float uCoreWhite;

varying vec2 vUv;
varying vec3 vLocalPos;

${GLSL_COLOR_UTILS}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 p = vLocalPos.xy / 3.35;
  float r = length(p);
  if (r < 0.24 || r > 0.99) discard;

  float angle = atan(p.y, p.x + 1e-5);
  float normAngle = (angle + 3.14159265) / 6.2831853;

  float revealEdge = mix(0.22, 1.05, uReveal);
  float revealMask = smoothstep(revealEdge + 0.06, revealEdge - 0.08, r) * smoothstep(0.0, 0.12, uReveal);
  if (revealMask <= 0.002) discard;

  float ringFreq = 16.0;
  float ringCoord = r * ringFreq;
  float ringIdx = floor(ringCoord);
  float ringFrac = fract(ringCoord);
  float concentricLine = smoothstep(0.09, 0.02, abs(ringFrac - 0.5));

  float sectorCount = 24.0 + mod(ringIdx, 3.0) * 12.0;
  float sectorCoord = normAngle * sectorCount;
  float sectorIdx = floor(sectorCoord);
  float sectorFrac = fract(sectorCoord);

  float cellHash = hash12(vec2(ringIdx, sectorIdx));
  float trackPresent = step(0.32, cellHash);

  float arcSegment = smoothstep(0.08, 0.14, sectorFrac) * smoothstep(0.92, 0.86, sectorFrac);
  float arcTrace = concentricLine * arcSegment * trackPresent;

  float spokeCount = 32.0;
  float spokeCoord = normAngle * spokeCount;
  float spokeIdx = floor(spokeCoord);
  float spokeFrac = fract(spokeCoord);
  float spokeHash = hash12(vec2(spokeIdx, floor(r * 6.0)));
  float radialLine = smoothstep(0.055 / max(r, 0.25), 0.012 / max(r, 0.25), abs(spokeFrac - 0.5));
  float radialTrace = radialLine * step(0.54, spokeHash) * smoothstep(0.28, 0.34, r) * smoothstep(0.96, 0.88, r);

  float nodeDist = length(vec2((sectorFrac - 0.5) * r * 1.4, (ringFrac - 0.5) * 0.42));
  float logicNode = smoothstep(0.07, 0.02, nodeDist) * step(0.68, cellHash);

  float dir = mod(ringIdx, 2.0) < 0.5 ? 1.0 : -1.0;
  float speed = 0.09 + mod(ringIdx * 0.37, 0.12);
  float packetPos = fract(normAngle * 2.0 + (uTime * speed + uCircPhase * 0.24) * dir + cellHash);
  float arcPacket = pow(smoothstep(0.18, 0.0, abs(packetPos - 0.5)), 2.2) * arcTrace;

  float radialPacketWave = fract(r * 1.8 - uTime * (0.28 + uKinetic * 0.35) + uCircPhase * 0.42 + spokeHash);
  float radialPacket = pow(smoothstep(0.14, 0.0, abs(radialPacketWave - 0.5)), 2.4) * radialTrace;

  // Sweeping concentric circulation pulse across the circuit disc during Zoom In / Out
  float circWave = pow(0.5 + 0.5 * sin(r * 18.0 + uCircPhase * 4.2), 3.0) * abs(uCircIntensity) * 0.55;

  float shockWave = exp(-pow((r - uOutwardWave) / 0.07, 2.0)) * sin(uOutwardWave * 3.14159265);

  float pointerDist = length(p - uPointerLocal);
  float touchSheen = exp(-pointerDist * pointerDist * 4.5) * uPointerInfluence * 0.52;

  float innerFade = smoothstep(0.24, 0.34, r);
  float outerFade = smoothstep(0.99, 0.82, r);
  float radialEnvelope = innerFade * outerFade;

  float radialBlend = smoothstep(0.32, 0.90, r);
  vec3 traceColor = mix(uDeepColor, uPrimaryColor, 0.42 + radialBlend * 0.48);
  vec3 hotTip = mix(uAccentColor, vec3(1.0), 0.45 * uCoreWhite);

  vec3 col = vec3(0.0);
  col += traceColor * (arcTrace * 0.52 + radialTrace * 0.40);
  col += mix(uPrimaryColor, uAccentColor, radialBlend * 0.65) * logicNode * (0.78 + uPulse * 0.24);
  col += mix(uAccentColor, uDeepColor, 0.16) * (arcPacket * 1.25 + radialPacket * 1.05) * (0.85 + uKinetic * 0.5);
  col += mix(uPrimaryColor, uAccentColor, 0.6) * circWave * (arcTrace + radialTrace + 0.18);
  col += hotTip * shockWave * (arcTrace + radialTrace + 0.3) * 1.05;
  col += uAccentColor * touchSheen * (arcTrace + radialTrace + logicNode + 0.12);

  float substrateGlow = exp(-pow((r - 0.56) / 0.26, 2.0)) * 0.06;
  col += uDeepColor * substrateGlow;

  col = applySaturation(col, uSaturation);
  col *= radialEnvelope * revealMask;

  float alpha = clamp((arcTrace * 0.48 + radialTrace * 0.38 + logicNode * 0.78 + arcPacket + radialPacket + shockWave * 0.5 + circWave * 0.35 + substrateGlow) * radialEnvelope * revealMask, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * 4. Holographic Concentric Energy Ring Shader (Precision Segmented Arcs + Ticks)
 */
export const ENERGY_RING_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vPos;
void main() {
  vUv = uv;
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const ENERGY_RING_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uReveal;
uniform float uPulse;
uniform float uKinetic;
uniform float uCircPhase;
uniform float uCircIntensity;
uniform float uInnerRadius;
uniform float uOuterRadius;
uniform float uSegments;
uniform float uTicks;
uniform float uVioletMix;
uniform float uSeed;
uniform vec3 uDeepColor;
uniform vec3 uPrimaryColor;
uniform vec3 uAccentColor;
uniform float uSaturation;
uniform float uCoreWhite;

varying vec2 vUv;
varying vec3 vPos;

${GLSL_COLOR_UTILS}

void main() {
  float r = length(vPos.xy);
  float rn = (r - uInnerRadius) / max(0.0001, uOuterRadius - uInnerRadius);
  if (rn < 0.0 || rn > 1.0) discard;

  float angle = atan(vPos.y, vPos.x + 1e-5);
  float normA = fract((angle + 3.14159265) / 6.2831853 + uSeed);

  float symA = abs(normA - 0.5) * 2.0;
  float revealEdge = smoothstep(uReveal + 0.04, uReveal - 0.04, symA) * smoothstep(0.0, 0.08, uReveal);
  if (revealEdge <= 0.002) discard;

  float innerRail = smoothstep(0.14, 0.02, abs(rn - 0.14));
  float outerRail = smoothstep(0.12, 0.02, abs(rn - 0.86));

  float segWave = sin(normA * 6.2831853 * uSegments + uSeed * 6.2831853);
  float segMask = smoothstep(-0.15, 0.25, segWave);
  float centerBand = smoothstep(0.24, 0.04, abs(rn - 0.5)) * segMask;

  float tickWave = pow(max(0.0, sin(normA * 6.2831853 * uTicks)), 10.0);
  float tickBand = smoothstep(0.32, 0.08, abs(rn - 0.5)) * tickWave * 0.65;

  float pulse1 = pow(max(0.0, cos((normA - uTime * 0.14 - uCircPhase * 0.22) * 6.2831853)), 8.0);
  float pulse2 = pow(max(0.0, cos((normA + uTime * 0.09 + uCircPhase * 0.16 + 0.35) * 6.2831853 * 2.0)), 10.0);
  float sweep = (pulse1 * 0.82 + pulse2 * 0.52) * (0.72 + uKinetic * 0.6 + abs(uCircIntensity) * 0.55);

  float revealTip = exp(-pow((symA - uReveal) / 0.045, 2.0)) * (1.0 - smoothstep(0.92, 1.0, uReveal)) * smoothstep(0.0, 0.1, uReveal);

  // Rich chromatic separation across ring tiers: deep electric -> vivid primary -> neon accent
  vec3 baseHue = mix(uPrimaryColor, uAccentColor, uVioletMix);
  vec3 railHue = mix(uDeepColor, baseHue, 0.52);
  vec3 brightTip = mix(uAccentColor, vec3(1.0), 0.35 + 0.45 * uCoreWhite);

  vec3 col = vec3(0.0);
  col += railHue * (innerRail * 0.82 + outerRail * 0.65);
  col += baseHue * centerBand * (0.64 + uPulse * 0.22 + sweep * 0.78);
  col += mix(uAccentColor, uDeepColor, 0.22) * tickBand * (0.52 + sweep * 0.42);
  col += brightTip * (revealTip * 1.25 + centerBand * sweep * 0.38);

  col = applySaturation(col, uSaturation);

  float intensity = (innerRail * 0.78 + outerRail * 0.58 + centerBand * 0.74 + tickBand * 0.48 + revealTip);
  float alpha = clamp(intensity * revealEdge * (0.78 + uPulse * 0.14), 0.0, 1.0);

  gl_FragColor = vec4(col * revealEdge, alpha);
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

  float inwardPulse = fract(vRadialT + uTime * (0.78 - uIdleBlend * 0.42) + vLineSeed);
  float head = smoothstep(0.0, 0.18, inwardPulse) * smoothstep(0.62, 0.18, inwardPulse);

  float birthHead = 1.0 - uFlow;
  float birthEnvelope = mix(smoothstep(birthHead - 0.18, birthHead + 0.12, vRadialT), 1.0, uIdleBlend);

  float baseLine = 0.16 * (1.0 - uIdleBlend * 0.45);
  float stream = head * (0.95 - uIdleBlend * 0.35 + uKinetic * 0.45);

  float endsFade = smoothstep(0.04, 0.18, vRadialT) * smoothstep(1.0, 0.72, vRadialT);

  vec3 col = mix(uAccentColor, mix(uPrimaryColor, uDeepColor, fract(vLineSeed * 7.3)), vRadialT * 0.8);
  col += mix(uAccentColor, vec3(1.0), 0.55 * uCoreWhite) * head * 0.42 * (1.0 - uIdleBlend * 0.55);
  col = applySaturation(col, uSaturation);

  float alpha = clamp((baseLine + stream) * endsFade * birthEnvelope * uVisibility, 0.0, 1.0);
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

varying float vColorMix;
varying float vAlpha;

void main() {
  float angSpeed = aSpeed * (1.0 + uGather * 1.45 + uKinetic * 0.8);
  // Helical vortex swirl: inner particles circulate faster than outer particles during zoom
  float swirlFactor = 1.65 / (0.65 + aRadius * 0.45);
  float theta = aAngle + uTime * angSpeed + uCircPhase * swirlFactor;

  float gatheredRadius = mix(aRadius, 0.36 + aPhase * 0.48, uGather * 0.84);
  float waveKick = exp(-pow((aRadius / 4.8 - uOutwardWave) / 0.12, 2.0)) * sin(uOutwardWave * 3.14159265) * 0.38;
  float radialBreathing = sin(uTime * 1.1 + aPhase * 6.2831853) * 0.08 * (1.0 - uGather * 0.6);
  // Subtle spiral contraction on zoom-in and radial expansion on zoom-out
  float circRadialPull = -uCircIntensity * (0.28 + 0.16 * sin(aPhase * 6.2831853 + uCircPhase * 2.0)) * smoothstep(0.6, 3.6, aRadius);
  float r = max(0.16, gatheredRadius + waveKick + radialBreathing + circRadialPull);

  // Subtle 3D helical funnel elevation during circulation
  float funnelLift = uCircIntensity * (0.34 - aRadius * 0.06) * (0.5 + aPhase * 0.5);
  float y = aHeight * (1.0 - uGather * 0.65) + sin(uTime * 0.95 + aPhase * 6.2831853) * 0.14 + funnelLift;

  vec3 pos = vec3(cos(theta) * r, y, sin(theta) * r);
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  gl_Position = projectionMatrix * mvPosition;

  float twinkle = 0.68 + 0.32 * sin(uTime * 2.1 + aPhase * 19.3);
  float pointSize = aSize * (0.85 + uPulse * 0.15 + waveKick * 1.1 + abs(uCircIntensity) * 0.25) * uPixelRatio * (18.0 / max(1.5, -mvPosition.z));
  gl_PointSize = clamp(pointSize, 1.5, 36.0);

  vColorMix = aColorMix;
  vAlpha = uVisibility * twinkle * (0.65 + uGather * 0.35);
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

  float alpha = clamp(((ring * 0.22 + spokes * 0.09) * fade + underGlow) * uReveal, 0.0, 1.0);
  gl_FragColor = vec4(col * uReveal, alpha);
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
  float headA = fract(loopT * 2.0 - dir * (uTime * (0.32 + uSeed * 0.14) + uCircPhase * 0.38) + uSeed);
  float streamA = smoothstep(0.0, 0.78, headA) * smoothstep(1.0, 0.86, headA);
  float cometA = pow(streamA, 1.65);

  float headB = fract(loopT * 3.0 + dir * (uTime * (0.21 + uSeed * 0.09) + uCircPhase * 0.28) + uSeed * 2.7);
  float streamB = smoothstep(0.15, 0.82, headB) * smoothstep(1.0, 0.88, headB);
  float cometB = pow(streamB, 2.2) * 0.75;

  // Fine shimmering harmonic modulation along the silk ribbon
  float shimmer = 0.72 + 0.28 * sin(loopT * 37.6991 - dir * uTime * 3.2 - uCircPhase * 3.5 + uSeed * 9.0);

  // Subtle continuous orbital trace so the 3D weave always reads cleanly
  float baseTrack = 0.24 + 0.14 * shimmer;
  float energy = (baseTrack + cometA * 1.15 + cometB * 0.85) * (0.82 + uPulse * 0.24 + uKinetic * 0.42 + abs(uCircIntensity) * 0.35);

  float colorWave = 0.5 + 0.5 * sin(loopT * 6.2831853 * 2.0 - uTime * 0.9 - uCircPhase * 1.2 + uSeed * 6.2831853);
  vec3 ribbonCol = mix(uDeepColor, uPrimaryColor, smoothstep(0.05, 0.65, colorWave));
  ribbonCol = mix(ribbonCol, uAccentColor, clamp(cometA * 0.78 + fresnel * 0.48, 0.0, 1.0));

  vec3 col = ribbonCol * energy * (0.55 + coreTube * 0.55 + fresnel * 0.85);
  col += mix(uAccentColor, vec3(1.0), 0.72 * uCoreWhite) * pow(cometA, 3.2) * (0.42 + uKinetic * 0.35);
  col = applySaturation(col, uSaturation);

  float alpha = clamp((baseTrack * 0.65 + cometA * 0.82 + cometB * 0.52 + fresnel * 0.35) * uUnfold, 0.0, 0.96);
  gl_FragColor = vec4(col * uUnfold, alpha);
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
uniform float uSegments;
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
  if (uReveal <= 0.002) discard;

  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewPos);
  float ndotv = abs(dot(N, V));
  float fresnel = pow(1.0 - ndotv, 1.5);

  float loopT = fract(vUv.x + uSeed);
  float dir = uSeed > 0.5 ? 1.0 : -1.0;

  // Precision segmented holographic light arcs with clean breathing gaps
  float arcPhase = fract(loopT * uSegments - dir * (uTime * 0.06 + uCircPhase * 0.14));
  float arcBody = smoothstep(0.06, 0.18, arcPhase) * smoothstep(0.92, 0.78, arcPhase);
  float microNotch = 0.82 + 0.18 * sin(loopT * 6.2831853 * uSegments * 6.0);

  // Flowing luminous light pulses racing around the optical filament
  float runnerA = fract(loopT * 2.0 - dir * (uTime * 0.24 + uCircPhase * 0.34) + uSeed);
  float cometA = pow(smoothstep(0.0, 0.82, runnerA) * smoothstep(1.0, 0.88, runnerA), 2.4);

  float runnerB = fract(loopT * 3.0 + dir * (uTime * 0.16 + uCircPhase * 0.22) + uSeed * 1.9);
  float cometB = pow(smoothstep(0.12, 0.85, runnerB) * smoothstep(1.0, 0.90, runnerB), 2.8) * 0.65;

  float baseGlow = (0.14 + arcBody * 0.58 * microNotch);
  float energy = (baseGlow + cometA * 1.05 + cometB * 0.7) * (0.82 + uPulse * 0.22 + uKinetic * 0.38 + abs(uCircIntensity) * 0.35);

  float tintWave = 0.5 + 0.5 * sin(loopT * 6.2831853 * 3.0 - uTime * 0.7 + uSeed * 6.2831853);
  vec3 col = mix(uPrimaryColor, uAccentColor, smoothstep(0.15, 0.85, tintWave) * 0.72 + cometA * 0.35);
  col = mix(uDeepColor, col, 0.65 + arcBody * 0.35);
  col *= energy * (0.58 + ndotv * 0.45 + fresnel * 0.72);
  col += mix(uAccentColor, vec3(1.0), 0.68 * uCoreWhite) * pow(cometA, 3.0) * 0.55;
  col = applySaturation(col, uSaturation);

  float alpha = clamp((baseGlow * 0.62 + cometA * 0.85 + cometB * 0.48) * uReveal, 0.0, 0.95);
  gl_FragColor = vec4(col * uReveal, alpha);
}
`;


