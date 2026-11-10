// Sky spike "layers" for issue #1505: an art-directed dome. A zenith-to-horizon gradient keyed
// from the day cycle's own palette (the keyed sky colour, the height-mist colour that the
// content already warms at dawn and dusk, and the hemisphere sky), a disc sun and moon, hash
// stars, and three cloud layers drifting over generated tileable noise. Nothing new is
// authored: every colour derives from the keyed sky (engine/core/sky.ts, skyAt), so content
// still owns the look; a real implementation would author the stops directly.

import type { Rgb } from '@skelly/engine/sky';
import {
  BackSide,
  Color,
  DataTexture,
  LinearFilter,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import {
  DOME_GLSL,
  domeMesh,
  fogColorLinear,
  placeDome,
  type SkyDome,
  type SkyDomeFrame,
  starWeightOf,
} from './skyDome.ts';

/** Deterministic; a spike needs no world seed. */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= Math.imul(t ^ (t >>> 7), 61 | t) + t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const smooth = (t: number): number => t * t * (3 - 2 * t);
const between = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  between(a[0], b[0], t),
  between(a[1], b[1], t),
  between(a[2], b[2], t),
];

/** One periodic value-noise octave sampled on [0, 1)², wrapping at `period`. */
const latticeNoise = (period: number, random: () => number): ((x: number, y: number) => number) => {
  const lattice = Float32Array.from({ length: period * period }, random);
  return (x: number, y: number) => {
    const fx = x * period;
    const fy = y * period;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const at = (ix: number, iy: number): number => {
      const width = ((ix % period) + period) % period;
      const height = ((iy % period) + period) % period;
      return lattice[height * period + width]!;
    };
    return between(between(at(x0, y0), at(x0 + 1, y0), tx), between(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty);
  };
};

/** Tileable FBM in [0, 1] on a `size`² grid. */
const fbm = (basePeriod: number, seed: number, size: number): Float32Array => {
  const random = mulberry32(seed);
  const octaves = [basePeriod, basePeriod * 2, basePeriod * 4, basePeriod * 8].map((period) =>
    latticeNoise(period, random),
  );
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0;
      let weight = 0;
      for (const [index, noise] of octaves.entries()) {
        const amplitude = 1 / 2 ** index;
        value += noise(x / size, y / size) * amplitude;
        weight += amplitude;
      }
      out[y * size + x] = value / weight;
    }
  }
  return out;
};

/** R: broad cloud masses, G: wispy break-up; two textures feed three layers. */
const cloudTexture = (seed: number): DataTexture => {
  const size = 256;
  const broad = fbm(5, seed, size);
  const wisp = fbm(13, seed + 101, size);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = broad[i]! * 255;
    data[i * 4 + 1] = wisp[i]! * 255;
    data[i * 4 + 3] = 255;
  }
  const texture = new DataTexture(data, size, size);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
};

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vDir;
  void main () {
    // Unit sphere at the camera: the local position is the view direction.
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uFogColor;
  uniform float uSkyVisibility;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uMoonColor;
  uniform vec3 uMoonDir;
  uniform float uSunGlow;
  uniform float uStarWeight;
  uniform float uDaylight;
  uniform float uTime;
  uniform sampler2D uCloudNoise[3];
  uniform vec2 uDrift[3];
  uniform float uScale[3];
  uniform float uOpacity[3];
  ${DOME_GLSL}
  void main () {
    vec3 dir = normalize( vDir );
    vec3 col = mix( uMid, uZenith, smoothstep( 0.12, 0.55, dir.y ) );
    col = mix( uHorizon, col, smoothstep( 0.015, 0.14, dir.y ) );
    col += domeSun( dir, uSunDir, uSunColor, uSunGlow );
    col += domeSun( dir, uMoonDir, uMoonColor, 0.3 );
    col += domeStars( dir, uStarWeight );
    float horizonFade = smoothstep( 0.02, 0.14, dir.y );
    vec3 cloudLight = uSunColor * uDaylight * 0.8 + vec3( 0.045, 0.055, 0.075 );
    for ( int i = 0; i < 3; i++ ) {
      vec2 uv = dir.xz / max( dir.y, 0.06 ) * uScale[i] + uDrift[i] * uTime;
      vec2 noise = texture2D( uCloudNoise[i], uv ).rg;
      float coverage = smoothstep( 0.45, 0.75, noise.r + ( noise.g - 0.5 ) * 0.35 );
      float sunSide = 0.6 + 0.4 * clamp( dot( dir, uSunDir ), 0.0, 1.0 );
      col = mix( col, cloudLight * sunSide, coverage * uOpacity[i] * horizonFade );
    }
    col = mix( col * uSkyVisibility, uFogColor, 1.0 - smoothstep( 0.0, 0.06, dir.y ) );
    col = mix( uFogColor, col, smoothstep( -0.05, 0.0, dir.y ) );
    gl_FragColor = vec4( col, 1.0 );
  }
`;

const LAYERS = [
  { texture: 0, scale: 0.35, drift: new Vector2(0.0006, 0.000_13), opacity: 0.32 },
  { texture: 1, scale: 0.9, drift: new Vector2(-0.0011, 0.0004), opacity: 0.5 },
  { texture: 0, scale: 2.2, drift: new Vector2(0.0028, -0.0019), opacity: 0.42 },
] as const;

const setSrgb = (into: Color, [r, g, b]: Rgb): Color => into.setRGB(r, g, b, SRGBColorSpace);

/** The keyed palette drives the gradient: the sky colour at the horizon band, deepened toward the hemisphere sky above. */
const gradientStops = (sky: {
  sky: Rgb;
  ambientSky: Rgb;
  heightFogColor: Rgb;
}): { zenith: Rgb; mid: Rgb; horizon: Rgb } => ({
  zenith: [
    between(sky.ambientSky[0], sky.sky[0], 0.35) * 0.5,
    between(sky.ambientSky[1], sky.sky[1], 0.35) * 0.5,
    between(sky.ambientSky[2], sky.sky[2], 0.35) * 0.5,
  ],
  mid: sky.sky,
  horizon: mixRgb(sky.heightFogColor, sky.sky, 0.4),
});

/** The layered spike: the dome's mesh joins the scene; dispose removes it. */
export const createLayeredSkyDome = (): SkyDome => {
  const textures = [cloudTexture(1), cloudTexture(2)];
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new Color(0, 0, 0) },
      uMid: { value: new Color(0, 0, 0) },
      uHorizon: { value: new Color(0, 0, 0) },
      uFogColor: { value: new Color(0, 0, 0) },
      uSkyVisibility: { value: 1 },
      uSunColor: { value: new Color(0, 0, 0) },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uMoonColor: { value: new Color(0.65, 0.7, 0.8) },
      uMoonDir: { value: new Vector3(0, -1, 0) },
      uSunGlow: { value: 0.5 },
      uStarWeight: { value: 0 },
      uDaylight: { value: 1 },
      uTime: { value: 0 },
      uCloudNoise: { value: LAYERS.map((layer) => textures[layer.texture]!) },
      uDrift: { value: LAYERS.map((layer) => layer.drift) },
      uScale: { value: LAYERS.map((layer) => layer.scale) },
      uOpacity: { value: LAYERS.map((layer) => layer.opacity) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
  const mesh = domeMesh(material);
  const update = ({ sky, time, camera, skyVisibility }: SkyDomeFrame): void => {
    const { uniforms } = material;
    const stops = gradientStops(sky);
    setSrgb(uniforms.uZenith!.value as Color, stops.zenith);
    setSrgb(uniforms.uMid!.value as Color, stops.mid);
    setSrgb(uniforms.uHorizon!.value as Color, stops.horizon);
    fogColorLinear(uniforms.uFogColor!.value as Color, sky, skyVisibility);
    uniforms.uSkyVisibility!.value = skyVisibility;
    (uniforms.uSunDir!.value as Vector3).set(...sky.sunDirection);
    (uniforms.uMoonDir!.value as Vector3).set(-sky.sunDirection[0], -sky.sunDirection[1], -sky.sunDirection[2]);
    setSrgb(uniforms.uSunColor!.value as Color, sky.lightColor);
    uniforms.uSunGlow!.value = Math.min(1, sky.lightIntensity);
    uniforms.uStarWeight!.value = starWeightOf(sky);
    uniforms.uDaylight!.value = Math.min(1, Math.max(0, sky.sunDirection[1] * 3));
    uniforms.uTime!.value = time;
    placeDome(mesh, camera);
  };
  return {
    mesh,
    update,
    setHidden(hidden: boolean): void {
      mesh.visible = !hidden;
    },
    dispose(): void {
      mesh.geometry.dispose();
      material.dispose();
      for (const texture of textures) {
        texture.dispose();
      }
    },
  };
};
