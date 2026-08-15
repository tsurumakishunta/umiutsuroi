"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";

// All controls intentionally live here rather than in the view.
// Change these values to tune the ocean without adding on-screen UI.
const OCEAN_CONFIG = {
  fftSize: 128,
  oceanSize: 560,
  spectrumAmplitude: 0.00000072,
  windSpeed: 12.5,
  windDirection: [0.92, -0.38] as const,
  shortWaveDamping: 0.085,
  choppiness: 1.18,
  waveCycleSeconds: 60,
  waveStrengthMin: 0.62,
  waveStrengthMax: 1.55,
  choppinessMin: 0.72,
  choppinessMax: 1.35,
  distortionCalm: 1.8,
  distortionStrong: 3.7,
  atmosphereReflectionStrength: 0.64,
  nightSkyLightStrength: 0.92,
  starCount: 1700,
  cycleSeconds: 30,
  transitionPortion: 0.38,
  cameraHeight: 7.2,
  cameraDrift: 3.4,
  cameraTargetHeight: -3.8,
  cameraTargetZ: -58,
  seabedDepth: 2.8,
  nearWaterAlpha: 0.12,
  farWaterAlpha: 0.94,
  clarityDistance: 185,
  whitecapStrength: 0.72,
  minimumRenderWidth: 1920,
  minimumRenderHeight: 1080,
  maxPixelRatio: 3,
  reflectionResolution: 1024,
} as const;

type Situation = {
  zenith: number;
  horizon: number;
  sea: number;
  deep: number;
  sun: number;
  sunDirection: readonly [number, number, number];
  stars: number;
  exposure: number;
  waveScale: number;
};

const SITUATIONS: readonly Situation[] = [
  {
    zenith: 0x2f9fd0,
    horizon: 0xf4c8a9,
    sea: 0x06b6c9,
    deep: 0x004e78,
    sun: 0xffd6a1,
    sunDirection: [-0.82, 0.18, -0.54],
    stars: 0,
    exposure: 0.9,
    waveScale: 0.64,
  },
  {
    zenith: 0x168fc9,
    horizon: 0xbfe9ed,
    sea: 0x02c4d6,
    deep: 0x00578f,
    sun: 0xfff6d5,
    sunDirection: [-0.18, 0.92, -0.34],
    stars: 0,
    exposure: 0.94,
    waveScale: 0.58,
  },
  {
    zenith: 0x515b7c,
    horizon: 0xe58358,
    sea: 0x0799b5,
    deep: 0x053c63,
    sun: 0xffa35c,
    sunDirection: [0.84, 0.14, -0.5],
    stars: 0,
    exposure: 0.86,
    waveScale: 0.72,
  },
  {
    zenith: 0x030813,
    horizon: 0x162b42,
    sea: 0x0b5275,
    deep: 0x02172e,
    sun: 0xc6ddff,
    sunDirection: [0.48, 0.26, -0.84],
    stars: 0.95,
    exposure: 0.64,
    waveScale: 0.65,
  },
] as const;

const FULLSCREEN_VERTEX = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

const SPECTRUM_FRAGMENT = `
  precision highp float;
  precision highp int;

  uniform sampler2D uInitialSpectrum;
  uniform float uTime;
  uniform int uResolution;
  uniform int uLogResolution;
  uniform float uOceanSize;
  uniform int uField;
  out vec4 outColor;

  vec2 complexMultiply(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
  }

  int reversedIndex(int value) {
    int reversed = 0;
    for (int bit = 0; bit < 16; bit++) {
      reversed = (reversed << 1) | (value & 1);
      value = value >> 1;
    }
    return reversed >> (16 - uLogResolution);
  }

  void main() {
    ivec2 destination = ivec2(gl_FragCoord.xy);
    ivec2 source = ivec2(reversedIndex(destination.x), reversedIndex(destination.y));
    ivec2 opposite = ivec2(
      (uResolution - source.x) % uResolution,
      (uResolution - source.y) % uResolution
    );

    vec2 h0 = texelFetch(uInitialSpectrum, source, 0).rg;
    vec2 h0Minus = texelFetch(uInitialSpectrum, opposite, 0).rg;
    vec2 h0MinusConjugate = vec2(h0Minus.x, -h0Minus.y);

    float centeredX = source.x <= uResolution / 2
      ? float(source.x)
      : float(source.x - uResolution);
    float centeredY = source.y <= uResolution / 2
      ? float(source.y)
      : float(source.y - uResolution);
    vec2 waveVector = 6.28318530718 * vec2(centeredX, centeredY) / uOceanSize;
    float waveNumber = length(waveVector);
    float omega = sqrt(9.81 * waveNumber);
    vec2 phase = vec2(cos(omega * uTime), sin(omega * uTime));
    vec2 inversePhase = vec2(phase.x, -phase.y);
    vec2 height = complexMultiply(h0, phase) + complexMultiply(h0MinusConjugate, inversePhase);

    if (waveNumber < 0.00001) {
      height = vec2(0.0);
    }

    vec2 minusIHeight = vec2(height.y, -height.x);
    vec2 displacementX = minusIHeight * (waveVector.x / max(waveNumber, 0.00001));
    vec2 displacementZ = minusIHeight * (waveVector.y / max(waveNumber, 0.00001));

    outColor = uField == 0
      ? vec4(height, displacementX)
      : vec4(displacementZ, 0.0, 0.0);
  }
`;

const FFT_FRAGMENT = `
  precision highp float;
  precision highp int;

  uniform sampler2D uInput;
  uniform int uStage;
  uniform ivec2 uDirection;
  out vec4 outColor;

  vec2 complexMultiply(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
  }

  void main() {
    ivec2 coordinate = ivec2(gl_FragCoord.xy);
    int index = uDirection.x == 1 ? coordinate.x : coordinate.y;
    int span = 1 << (uStage + 1);
    int halfSpan = span >> 1;
    int blockStart = (index / span) * span;
    int offset = index % halfSpan;
    int evenIndex = blockStart + offset;
    int oddIndex = evenIndex + halfSpan;

    ivec2 evenCoordinate = coordinate;
    ivec2 oddCoordinate = coordinate;
    if (uDirection.x == 1) {
      evenCoordinate.x = evenIndex;
      oddCoordinate.x = oddIndex;
    } else {
      evenCoordinate.y = evenIndex;
      oddCoordinate.y = oddIndex;
    }

    vec4 evenValue = texelFetch(uInput, evenCoordinate, 0);
    vec4 oddValue = texelFetch(uInput, oddCoordinate, 0);
    float angle = 6.28318530718 * float(offset) / float(span);
    vec2 twiddle = vec2(cos(angle), sin(angle));
    float signValue = (index % span) < halfSpan ? 1.0 : -1.0;

    vec2 first = evenValue.rg + signValue * complexMultiply(twiddle, oddValue.rg);
    vec2 second = evenValue.ba + signValue * complexMultiply(twiddle, oddValue.ba);
    outColor = vec4(first, second);
  }
`;

const WATER_VERTEX = `
  precision highp float;

  uniform mat4 textureMatrix;
  uniform sampler2D uDisplacementA;
  uniform sampler2D uDisplacementB;
  uniform float uOceanSize;
  uniform float uTexelSize;
  uniform float uChoppiness;
  uniform float uWaveScale;
  uniform float uFftNormalization;

  varying vec4 mirrorCoord;
  varying vec4 worldPosition;
  varying vec3 vFftNormal;
  varying float vFftHeight;

  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
  #include <logdepthbuf_pars_vertex>

  vec3 oceanPosition(vec2 sampleUv) {
    vec4 fieldA = texture2D(uDisplacementA, sampleUv) * uFftNormalization;
    vec4 fieldB = texture2D(uDisplacementB, sampleUv) * uFftNormalization;
    vec2 centered = sampleUv - 0.5;
    return vec3(
      centered.x * uOceanSize + fieldA.z * uChoppiness * uWaveScale,
      centered.y * uOceanSize - fieldB.x * uChoppiness * uWaveScale,
      fieldA.x * uWaveScale
    );
  }

  void main() {
    vec3 center = oceanPosition(uv);
    vec3 right = oceanPosition(uv + vec2(uTexelSize, 0.0));
    vec3 forward = oceanPosition(uv + vec2(0.0, uTexelSize));
    vec3 localNormal = normalize(cross(right - center, forward - center));

    vFftNormal = normalize(mat3(modelMatrix) * localNormal);
    vFftHeight = center.z;
    mirrorCoord = modelMatrix * vec4(center, 1.0);
    worldPosition = mirrorCoord;
    mirrorCoord = textureMatrix * mirrorCoord;
    vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
    #include <shadowmap_vertex>
  }
`;

const SKY_VERTEX = `
  precision highp float;
  out vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    vec4 clipPosition = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
    gl_Position = clipPosition.xyww;
  }
`;

const SKY_FRAGMENT = `
  precision highp float;

  uniform vec3 uHorizonColor;
  uniform vec3 uZenithColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uStars;
  uniform float uTime;

  in vec3 vDirection;
  out vec4 outColor;

  void main() {
    vec3 direction = normalize(vDirection);
    float height = clamp(direction.y, 0.0, 1.0);
    float gradient = pow(height, 0.42);
    vec3 color = mix(uHorizonColor, uZenithColor, gradient);

    float sunAlignment = max(dot(direction, normalize(uSunDirection)), 0.0);
    float sunDisc = smoothstep(0.9993, 0.99978, sunAlignment);
    float sunHalo = pow(sunAlignment, 96.0);
    float daylight = 1.0 - smoothstep(0.08, 0.72, uStars);
    color += uSunColor * (sunDisc * 2.1 + sunHalo * 0.42) * daylight;

    color = color / (color + vec3(0.72));
    color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    outColor = vec4(color, 1.0);
  }
`;

const STAR_VERTEX = `
  precision highp float;

  uniform float uPixelRatio;
  in float aSize;
  in float aPhase;
  in vec3 aColor;
  out float vPhase;
  out vec3 vColor;

  void main() {
    vPhase = aPhase;
    vColor = aColor;
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STAR_FRAGMENT = `
  precision highp float;

  uniform float uVisibility;
  uniform float uTime;
  in float vPhase;
  in vec3 vColor;
  out vec4 outColor;

  void main() {
    float radial = length(gl_PointCoord - 0.5) * 2.0;
    float antialias = max(fwidth(radial) * 1.2, 0.02);
    float disc = 1.0 - smoothstep(0.72 - antialias, 1.0 + antialias, radial);
    float core = 1.0 - smoothstep(0.0, 0.46, radial);
    float twinkle = 0.94 + 0.06 * sin(uTime * 1.1 + vPhase);
    float alpha = disc * uVisibility;
    if (alpha < 0.002) discard;
    outColor = vec4(vColor * (0.82 + core * 0.48) * twinkle, alpha);
  }
`;

const SEABED_VERTEX = `
  precision highp float;
  out vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SEABED_FRAGMENT = `
  precision highp float;

  uniform vec3 uSandColor;
  uniform vec3 uDeepColor;
  uniform vec3 uCameraPosition;
  uniform float uTime;
  uniform float uDaylight;

  in vec3 vWorldPosition;
  out vec4 outColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    vec2 blend = local * local * (3.0 - 2.0 * local);
    float a = hash(cell);
    float b = hash(cell + vec2(1.0, 0.0));
    float c = hash(cell + vec2(0.0, 1.0));
    float d = hash(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
  }

  float softFbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.56;
    mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
    for (int octave = 0; octave < 3; octave++) {
      value += valueNoise(p) * amplitude;
      p = turn * p * 2.03 + vec2(4.7, 1.9);
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    vec2 p = vWorldPosition.xz;
    vec2 slowFlow = vec2(uTime * 0.025, -uTime * 0.018);
    float warpX = softFbm(p * 0.1 + slowFlow);
    float warpY = softFbm(p * 0.1 + vec2(7.3, 3.8) - slowFlow);
    vec2 warped = p * 0.36 + (vec2(warpX, warpY) - 0.5) * 3.1;
    float broadLight = softFbm(warped + slowFlow * 2.4);
    float fineLight = softFbm(warped * 1.73 - slowFlow * 3.2 + vec2(2.1, 8.4));
    float caustics = smoothstep(0.62, 0.84, broadLight * 0.72 + fineLight * 0.28);
    caustics *= caustics;
    float sandRipple = softFbm(p * 0.16 + vec2(13.4, 2.6));
    float grain = (valueNoise(p * 2.4) - 0.5) * 0.035;
    float distanceToCamera = length(uCameraPosition.xz - p);
    float deepFade = smoothstep(42.0, 175.0, distanceToCamera);

    vec3 underwaterSand = mix(uSandColor, vec3(0.025, 0.44, 0.42), 0.34);
    vec3 litSand = underwaterSand * (0.56 + sandRipple * 0.13 + grain);
    litSand += vec3(0.025, 0.24, 0.19) * caustics * 0.72;
    vec3 nightSand = uDeepColor * 0.22;
    vec3 color = mix(nightSand, litSand, uDaylight);
    color = mix(color, uDeepColor * 0.5, deepFade * 0.82);
    color = color / (color + vec3(0.88));
    color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    outColor = vec4(color, 1.0);
  }
`;

function smoothstep(value: number) {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function gaussianRandom() {
  const first = Math.max(Math.random(), 0.000001);
  const second = Math.random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function createInitialSpectrum() {
  const size = OCEAN_CONFIG.fftSize;
  const values = new Float32Array(size * size * 4);
  const gravity = 9.81;
  const largestWave = (OCEAN_CONFIG.windSpeed * OCEAN_CONFIG.windSpeed) / gravity;
  const wind = new THREE.Vector2(...OCEAN_CONFIG.windDirection).normalize();

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const centeredX = x <= size / 2 ? x : x - size;
      const centeredY = y <= size / 2 ? y : y - size;
      const kx = (2 * Math.PI * centeredX) / OCEAN_CONFIG.oceanSize;
      const ky = (2 * Math.PI * centeredY) / OCEAN_CONFIG.oceanSize;
      const waveNumber = Math.hypot(kx, ky);
      const index = (y * size + x) * 4;

      if (waveNumber < 0.00001) {
        continue;
      }

      const direction = (kx * wind.x + ky * wind.y) / waveNumber;
      const directionalWeight = direction < 0 ? direction * direction * 0.075 : direction * direction;
      const phillips =
        OCEAN_CONFIG.spectrumAmplitude *
        Math.exp(-1 / (waveNumber * waveNumber * largestWave * largestWave)) *
        directionalWeight *
        Math.exp(-waveNumber * waveNumber * OCEAN_CONFIG.shortWaveDamping ** 2) /
        Math.pow(waveNumber, 4);
      const magnitude = Math.sqrt(Math.max(phillips, 0) * 0.5);
      values[index] = gaussianRandom() * magnitude;
      values[index + 1] = gaussianRandom() * magnitude;
    }
  }

  const texture = new THREE.DataTexture(values, size, size, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createRenderTarget() {
  const target = new THREE.WebGLRenderTarget(OCEAN_CONFIG.fftSize, OCEAN_CONFIG.fftSize, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.wrapS = THREE.RepeatWrapping;
  target.texture.wrapT = THREE.RepeatWrapping;
  return target;
}

export function OceanExperience() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      container.dataset.fallback = "true";
      return;
    }

    const getRenderPixelRatio = () => {
      const fullHdScale = Math.max(
        OCEAN_CONFIG.minimumRenderWidth / Math.max(window.innerWidth, 1),
        OCEAN_CONFIG.minimumRenderHeight / Math.max(window.innerHeight, 1),
      );
      return Math.min(
        OCEAN_CONFIG.maxPixelRatio,
        Math.max(window.devicePixelRatio || 1, fullHdScale),
      );
    };
    const pixelRatio = getRenderPixelRatio();
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setClearColor(0x07121b, 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 1300);
    camera.position.set(0, OCEAN_CONFIG.cameraHeight, 24);

    const initialSpectrum = createInitialSpectrum();
    const targetsA = [createRenderTarget(), createRenderTarget()] as const;
    const targetsB = [createRenderTarget(), createRenderTarget()] as const;

    const computeScene = new THREE.Scene();
    const computeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const fullscreenGeometry = new THREE.BufferGeometry();
    fullscreenGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );

    const spectrumMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: SPECTRUM_FRAGMENT,
      uniforms: {
        uInitialSpectrum: { value: initialSpectrum },
        uTime: { value: 0 },
        uResolution: { value: OCEAN_CONFIG.fftSize },
        uLogResolution: { value: Math.log2(OCEAN_CONFIG.fftSize) },
        uOceanSize: { value: OCEAN_CONFIG.oceanSize },
        uField: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const fftMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: FFT_FRAGMENT,
      uniforms: {
        uInput: { value: null },
        uStage: { value: 0 },
        uDirection: { value: new THREE.Vector2(1, 0) },
      },
      depthTest: false,
      depthWrite: false,
    });

    const computeQuad = new THREE.Mesh(fullscreenGeometry, spectrumMaterial);
    computeQuad.frustumCulled = false;
    computeScene.add(computeQuad);

    const atmosphereUniforms = {
      uHorizonColor: { value: new THREE.Color(SITUATIONS[0].horizon) },
      uZenithColor: { value: new THREE.Color(SITUATIONS[0].zenith) },
      uSunColor: { value: new THREE.Color(SITUATIONS[0].sun) },
      uSunDirection: { value: new THREE.Vector3(...SITUATIONS[0].sunDirection).normalize() },
      uStars: { value: SITUATIONS[0].stars },
      uTime: { value: 0 },
    };

    const skyMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: atmosphereUniforms,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(780, 64, 40), skyMaterial);
    sky.renderOrder = -10;
    scene.add(sky);

    const starPositions = new Float32Array(OCEAN_CONFIG.starCount * 3);
    const starColors = new Float32Array(OCEAN_CONFIG.starCount * 3);
    const starSizes = new Float32Array(OCEAN_CONFIG.starCount);
    const starPhases = new Float32Array(OCEAN_CONFIG.starCount);
    let starRandomState = 0x6d2b79f5;
    const nextStarRandom = () => {
      starRandomState = Math.imul(starRandomState ^ (starRandomState >>> 15), 1 | starRandomState);
      starRandomState ^= starRandomState + Math.imul(starRandomState ^ (starRandomState >>> 7), 61 | starRandomState);
      return ((starRandomState ^ (starRandomState >>> 14)) >>> 0) / 4294967296;
    };
    for (let index = 0; index < OCEAN_CONFIG.starCount; index += 1) {
      const azimuth = nextStarRandom() * Math.PI * 2;
      const elevation = 0.045 + nextStarRandom() * 0.955;
      const horizontal = Math.sqrt(Math.max(0, 1 - elevation * elevation));
      const radius = 742;
      starPositions[index * 3] = Math.cos(azimuth) * horizontal * radius;
      starPositions[index * 3 + 1] = elevation * radius;
      starPositions[index * 3 + 2] = Math.sin(azimuth) * horizontal * radius;

      const temperature = nextStarRandom();
      const colorOffset = index * 3;
      if (temperature < 0.18) {
        starColors[colorOffset] = 1;
        starColors[colorOffset + 1] = 0.86;
        starColors[colorOffset + 2] = 0.68;
      } else if (temperature < 0.54) {
        starColors[colorOffset] = 0.68;
        starColors[colorOffset + 1] = 0.82;
        starColors[colorOffset + 2] = 1;
      } else {
        starColors[colorOffset] = 0.9;
        starColors[colorOffset + 1] = 0.95;
        starColors[colorOffset + 2] = 1;
      }
      starSizes[index] = 0.8 + Math.pow(nextStarRandom(), 5) * 2.7;
      starPhases[index] = nextStarRandom() * Math.PI * 2;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute("aColor", new THREE.BufferAttribute(starColors, 3));
    starGeometry.setAttribute("aSize", new THREE.BufferAttribute(starSizes, 1));
    starGeometry.setAttribute("aPhase", new THREE.BufferAttribute(starPhases, 1));
    const starMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: {
        uPixelRatio: { value: pixelRatio },
        uVisibility: atmosphereUniforms.uStars,
        uTime: atmosphereUniforms.uTime,
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    stars.frustumCulled = false;
    stars.renderOrder = -5;
    sky.add(stars);

    const oceanUniforms = {
      uDisplacementA: { value: targetsA[0].texture },
      uDisplacementB: { value: targetsB[0].texture },
      uOceanSize: { value: OCEAN_CONFIG.oceanSize },
      uTexelSize: { value: 1 / OCEAN_CONFIG.fftSize },
      uChoppiness: { value: OCEAN_CONFIG.choppiness as number },
      uWaveScale: { value: SITUATIONS[0].waveScale },
      uFftNormalization: { value: 0.58 },
      uDeepColor: { value: new THREE.Color(SITUATIONS[0].deep) },
      uDaylight: { value: 1 },
      uNearWaterAlpha: { value: OCEAN_CONFIG.nearWaterAlpha },
      uFarWaterAlpha: { value: OCEAN_CONFIG.farWaterAlpha },
      uClarityDistance: { value: OCEAN_CONFIG.clarityDistance },
      uWhitecapStrength: { value: OCEAN_CONFIG.whitecapStrength as number },
      uSkyHorizonColor: atmosphereUniforms.uHorizonColor,
      uSkyZenithColor: atmosphereUniforms.uZenithColor,
      uAtmosphereReflectionStrength: { value: OCEAN_CONFIG.atmosphereReflectionStrength },
      uNightAmount: atmosphereUniforms.uStars,
      uNightSkyLightStrength: { value: OCEAN_CONFIG.nightSkyLightStrength },
    };

    const oceanGeometry = new THREE.PlaneGeometry(
      OCEAN_CONFIG.oceanSize,
      OCEAN_CONFIG.oceanSize,
      OCEAN_CONFIG.fftSize - 1,
      OCEAN_CONFIG.fftSize - 1,
    );
    const seabedUniforms = {
      uSandColor: { value: new THREE.Color(0x72c3ae) },
      uDeepColor: oceanUniforms.uDeepColor,
      uCameraPosition: { value: camera.position },
      uTime: atmosphereUniforms.uTime,
      uDaylight: oceanUniforms.uDaylight,
    };
    const seabedMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SEABED_VERTEX,
      fragmentShader: SEABED_FRAGMENT,
      uniforms: seabedUniforms,
      side: THREE.FrontSide,
    });
    const seabedGeometry = new THREE.PlaneGeometry(
      OCEAN_CONFIG.oceanSize,
      OCEAN_CONFIG.oceanSize,
    );
    const seabed = new THREE.Mesh(seabedGeometry, seabedMaterial);
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = -OCEAN_CONFIG.seabedDepth;
    seabed.renderOrder = 0;
    scene.add(seabed);

    const neutralWaterNormals = new THREE.DataTexture(
      new Uint8Array([128, 128, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    neutralWaterNormals.wrapS = THREE.RepeatWrapping;
    neutralWaterNormals.wrapT = THREE.RepeatWrapping;
    neutralWaterNormals.needsUpdate = true;

    const ocean = new Water(oceanGeometry, {
      textureWidth: OCEAN_CONFIG.reflectionResolution,
      textureHeight: OCEAN_CONFIG.reflectionResolution,
      waterNormals: neutralWaterNormals,
      sunDirection: atmosphereUniforms.uSunDirection.value,
      sunColor: SITUATIONS[0].sun,
      waterColor: SITUATIONS[0].sea,
      distortionScale: 2.6,
      fog: false,
    });
    const oceanMaterial = ocean.material as THREE.ShaderMaterial;
    const waterNormalsUrl = `${import.meta.env.BASE_URL}waternormals.jpg`;
    const waterNormals = new THREE.TextureLoader().load(waterNormalsUrl, (loadedTexture) => {
      loadedTexture.wrapS = THREE.RepeatWrapping;
      loadedTexture.wrapT = THREE.RepeatWrapping;
      loadedTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      oceanMaterial.uniforms.normalSampler.value = loadedTexture;
    });
    waterNormals.wrapS = THREE.RepeatWrapping;
    waterNormals.wrapT = THREE.RepeatWrapping;
    Object.assign(oceanMaterial.uniforms, oceanUniforms);
    oceanMaterial.uniforms.size.value = 0.5;
    oceanMaterial.vertexShader = WATER_VERTEX;
    oceanMaterial.fragmentShader = oceanMaterial.fragmentShader
      .replace(
        "varying vec4 worldPosition;",
        `varying vec4 worldPosition;
        varying vec3 vFftNormal;
        varying float vFftHeight;
        uniform vec3 uDeepColor;
        uniform float uDaylight;
        uniform float uNearWaterAlpha;
        uniform float uFarWaterAlpha;
        uniform float uClarityDistance;
        uniform float uWhitecapStrength;
        uniform vec3 uSkyHorizonColor;
        uniform vec3 uSkyZenithColor;
        uniform float uAtmosphereReflectionStrength;
        uniform float uNightAmount;
        uniform float uNightSkyLightStrength;`,
      )
      .replace(
        "vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );",
        `vec3 normalDetail = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );
          vec3 surfaceNormal = normalize( mix( normalDetail, vFftNormal, 0.72 ) );`,
      )
      .replace(
        "sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );",
        "sunLight( surfaceNormal, eyeDirection, 180.0, 0.72, 0.32, diffuseLight, specularLight );",
      )
      .replace(
        "vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );",
        `vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );
          vec3 reflectedViewDirection = normalize( reflect( -eyeDirection, surfaceNormal ) );
          float reflectedSkyHeight = clamp( reflectedViewDirection.y, 0.0, 1.0 );
          vec3 analyticalSkyReflection = mix(
            uSkyHorizonColor,
            uSkyZenithColor,
            pow( reflectedSkyHeight, 0.42 )
          );
          reflectionSample = mix(
            reflectionSample,
            analyticalSkyReflection,
            uAtmosphereReflectionStrength
          );`,
      )
      .replace(
        "vec3 outgoingLight = albedo;",
        `float shallowAmount = smoothstep( -0.75, 1.05, vFftHeight );
          vec3 deepLagoon = uDeepColor * 1.28 + vec3( 0.0, 0.008, 0.018 );
          vec3 nightShallow = mix( uDeepColor, waterColor, 0.32 );
          vec3 daylightShallow = waterColor * 1.08 + vec3( 0.0, 0.018, 0.032 );
          vec3 shallowLagoon = mix( nightShallow, daylightShallow, uDaylight );
          vec3 lagoonBody = mix( deepLagoon, shallowLagoon, shallowAmount );
          float bodyAmount = mix( 0.2, 0.44, smoothstep( 0.03, 0.82, theta ) );
          albedo = mix( albedo, lagoonBody, bodyAmount );
          float grazingReflection = 1.0 - smoothstep( 0.02, 0.62, theta );
          float atmosphereAmount = mix( 0.16, 0.58, grazingReflection )
            * uAtmosphereReflectionStrength;
          albedo = mix( albedo, analyticalSkyReflection, atmosphereAmount );
          float fftSlope = length( vFftNormal.xz ) / max( vFftNormal.y, 0.24 );
          float nightLitCrest = smoothstep( 0.08, 0.38, fftSlope )
            * smoothstep( -0.05, 0.92, vFftHeight );
          vec3 nightSkyLightColor = mix(
            vec3( 0.09, 0.2, 0.34 ),
            uSkyZenithColor + vec3( 0.055, 0.09, 0.15 ),
            0.46
          );
          float nightSkyLight = (0.07 + grazingReflection * 0.08 + nightLitCrest * 0.14)
            * uNightAmount * uNightSkyLightStrength;
          albedo += nightSkyLightColor * nightSkyLight;
          float foamNoise = noise.r * 0.62 + noise.g * 0.24 + noise.b * 0.14;
          float foamBreakup = smoothstep( 0.08, 0.46, foamNoise );
          float breakingFace = smoothstep( 0.14, 0.43, fftSlope );
          float crestCore = smoothstep( 0.54, 1.34, vFftHeight );
          float crestFringe = smoothstep( 0.3, 0.92, vFftHeight ) * smoothstep( 0.1, 0.31, fftSlope );
          float foam = clamp(
            (crestCore * breakingFace * foamBreakup + crestFringe * foamBreakup * 0.28)
              * uWhitecapStrength,
            0.0,
            0.72
          );
          vec3 daylightFoam = mix( vec3( 0.48, 0.8, 0.82 ), vec3( 0.86, 0.97, 0.94 ), foamBreakup );
          vec3 nightFoam = vec3( 0.16, 0.29, 0.45 ) + nightSkyLightColor * 0.14;
          vec3 foamColor = mix( nightFoam, daylightFoam, uDaylight );
          vec3 outgoingLight = mix( albedo, foamColor, foam );`,
      )
      .replace(
        "gl_FragColor = vec4( outgoingLight, alpha );",
        `float clarityByDistance = 1.0 - smoothstep( 35.0, uClarityDistance, distance );
          float clarityByAngle = smoothstep( 0.02, 0.14, theta );
          float clearWater = clarityByDistance * clarityByAngle * uDaylight;
          float waterAlpha = mix( uFarWaterAlpha, uNearWaterAlpha, clearWater );
          waterAlpha = max( waterAlpha, reflectance * 0.72 );
          waterAlpha = max( waterAlpha, foam * 0.88 );
          gl_FragColor = vec4( outgoingLight, waterAlpha );`,
      );
    oceanMaterial.needsUpdate = true;
    oceanMaterial.transparent = true;
    oceanMaterial.depthWrite = true;
    ocean.rotation.x = -Math.PI / 2;
    ocean.frustumCulled = false;
    ocean.renderOrder = 2;
    const renderWaterReflection = ocean.onBeforeRender.bind(ocean);
    let waterReflectionFrame = 0;
    ocean.onBeforeRender = (webglRenderer, renderedScene, renderedCamera, geometry, material, group) => {
      if (waterReflectionFrame % 2 === 0) {
        renderWaterReflection(webglRenderer, renderedScene, renderedCamera, geometry, material, group);
      }
      waterReflectionFrame += 1;
    };
    scene.add(ocean);

    const colorA = new THREE.Color();
    const colorB = new THREE.Color();
    const sunA = new THREE.Vector3();
    const sunB = new THREE.Vector3();
    const timer = new THREE.Timer();
    timer.connect(document);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const previewTimeValue = Number(new URLSearchParams(window.location.search).get("previewTime"));
    const previewTime = Number.isFinite(previewTimeValue) && previewTimeValue > 0 ? previewTimeValue : null;
    let animationFrame = 0;
    let animationTimeout = 0;
    let previewFrameCount = 0;

    const renderCompute = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) => {
      computeQuad.material = material;
      renderer.setRenderTarget(target);
      renderer.render(computeScene, computeCamera);
    };

    const transformField = (targets: readonly [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]) => {
      let sourceIndex = 0;
      let targetIndex = 1;
      computeQuad.material = fftMaterial;

      for (let direction = 0; direction < 2; direction += 1) {
        fftMaterial.uniforms.uDirection.value.set(direction === 0 ? 1 : 0, direction === 0 ? 0 : 1);
        for (let stage = 0; stage < Math.log2(OCEAN_CONFIG.fftSize); stage += 1) {
          fftMaterial.uniforms.uInput.value = targets[sourceIndex].texture;
          fftMaterial.uniforms.uStage.value = stage;
          renderCompute(fftMaterial, targets[targetIndex]);
          const previousSource = sourceIndex;
          sourceIndex = targetIndex;
          targetIndex = previousSource;
        }
      }
      return targets[sourceIndex].texture;
    };

    const mixSituation = (elapsed: number) => {
      const scenarioTime = Math.max(0, elapsed) / OCEAN_CONFIG.cycleSeconds;
      const currentIndex = Math.floor(scenarioTime) % SITUATIONS.length;
      const nextIndex = (currentIndex + 1) % SITUATIONS.length;
      const localTime = scenarioTime - Math.floor(scenarioTime);
      const transitionStart = 1 - OCEAN_CONFIG.transitionPortion;
      const blend = smoothstep((localTime - transitionStart) / OCEAN_CONFIG.transitionPortion);
      const current = SITUATIONS[currentIndex];
      const next = SITUATIONS[nextIndex];

      const mixColor = (target: THREE.Color, first: number, second: number) => {
        colorA.set(first);
        colorB.set(second);
        target.copy(colorA).lerp(colorB, blend);
      };

      mixColor(atmosphereUniforms.uHorizonColor.value, current.horizon, next.horizon);
      mixColor(atmosphereUniforms.uZenithColor.value, current.zenith, next.zenith);
      mixColor(atmosphereUniforms.uSunColor.value, current.sun, next.sun);
      mixColor(oceanMaterial.uniforms.sunColor.value, current.sun, next.sun);
      mixColor(oceanMaterial.uniforms.waterColor.value, current.sea, next.sea);
      mixColor(oceanUniforms.uDeepColor.value, current.deep, next.deep);
      sunA.set(...current.sunDirection).normalize();
      sunB.set(...next.sunDirection).normalize();
      atmosphereUniforms.uSunDirection.value.copy(sunA).lerp(sunB, blend).normalize();
      atmosphereUniforms.uStars.value = THREE.MathUtils.lerp(current.stars, next.stars, blend);
      oceanUniforms.uDaylight.value = 1 - atmosphereUniforms.uStars.value;
      const minutePhase = (Math.max(0, elapsed) % OCEAN_CONFIG.waveCycleSeconds)
        / OCEAN_CONFIG.waveCycleSeconds;
      const wavePulse = smoothstep(0.5 - Math.cos(minutePhase * Math.PI * 2) * 0.5);
      const waveStrength = THREE.MathUtils.lerp(
        OCEAN_CONFIG.waveStrengthMin,
        OCEAN_CONFIG.waveStrengthMax,
        wavePulse,
      );
      const situationWaveScale = THREE.MathUtils.lerp(current.waveScale, next.waveScale, blend);
      oceanUniforms.uWaveScale.value = situationWaveScale * waveStrength;
      oceanUniforms.uChoppiness.value = OCEAN_CONFIG.choppiness * THREE.MathUtils.lerp(
        OCEAN_CONFIG.choppinessMin,
        OCEAN_CONFIG.choppinessMax,
        wavePulse,
      );
      oceanUniforms.uWhitecapStrength.value = OCEAN_CONFIG.whitecapStrength * THREE.MathUtils.lerp(
        0.38,
        1.28,
        wavePulse,
      );
      oceanMaterial.uniforms.distortionScale.value = THREE.MathUtils.lerp(
        OCEAN_CONFIG.distortionCalm,
        OCEAN_CONFIG.distortionStrong,
        wavePulse,
      );
      renderer.toneMappingExposure = THREE.MathUtils.lerp(current.exposure, next.exposure, blend);
    };

    const animate = () => {
      timer.update();
      const elapsed = previewTime ?? timer.getElapsed();
      const cameraTime = reduceMotion ? elapsed * 0.12 : elapsed;
      mixSituation(elapsed);
      atmosphereUniforms.uTime.value = elapsed;
      oceanMaterial.uniforms.time.value = elapsed * 0.35;

      spectrumMaterial.uniforms.uTime.value = elapsed;
      spectrumMaterial.uniforms.uField.value = 0;
      renderCompute(spectrumMaterial, targetsA[0]);
      spectrumMaterial.uniforms.uField.value = 1;
      renderCompute(spectrumMaterial, targetsB[0]);
      oceanUniforms.uDisplacementA.value = transformField(targetsA);
      oceanUniforms.uDisplacementB.value = transformField(targetsB);

      camera.position.x = Math.sin(cameraTime * 0.045) * OCEAN_CONFIG.cameraDrift;
      camera.position.y = OCEAN_CONFIG.cameraHeight + Math.sin(cameraTime * 0.31) * (reduceMotion ? 0.025 : 0.16);
      camera.position.z = 24 + Math.cos(cameraTime * 0.035) * 1.8;
      camera.lookAt(
        Math.sin(cameraTime * 0.021) * 10,
        OCEAN_CONFIG.cameraTargetHeight + Math.sin(cameraTime * 0.027) * 0.4,
        OCEAN_CONFIG.cameraTargetZ,
      );
      sky.position.copy(camera.position);

      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      if (previewTime === null) {
        animationTimeout = window.setTimeout(() => {
          animationFrame = window.requestAnimationFrame(animate);
        }, 12);
      } else if (previewFrameCount < 12) {
        previewFrameCount += 1;
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    const handleResize = () => {
      const nextPixelRatio = getRenderPixelRatio();
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(nextPixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      starMaterial.uniforms.uPixelRatio.value = nextPixelRatio;
    };

    window.addEventListener("resize", handleResize);
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(animationTimeout);
      window.removeEventListener("resize", handleResize);
      timer.dispose();
      initialSpectrum.dispose();
      targetsA.forEach((target) => target.dispose());
      targetsB.forEach((target) => target.dispose());
      fullscreenGeometry.dispose();
      spectrumMaterial.dispose();
      fftMaterial.dispose();
      sky.geometry.dispose();
      skyMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      oceanGeometry.dispose();
      oceanMaterial.dispose();
      seabedGeometry.dispose();
      seabedMaterial.dispose();
      neutralWaterNormals.dispose();
      waterNormals.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <main
      ref={containerRef}
      className="ocean-experience"
      aria-label="朝、昼、夕、夜へ移ろう海の景色"
    />
  );
}
