// Sky spike "layers" for issue #1505: an art-directed dome. The keyed gradient (render/skyDome.ts,
// `setKeyedGradient`), a disc sun and moon, hash stars, and three cloud layers drifting over
// generated tileable noise. Every colour derives from the keyed sky (engine/core/sky.ts, skyAt),
// so content still owns the look.

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
  domeOutputUniforms,
  KEYED_GLSL,
  keyedGradientUniforms,
  placeDome,
  type SkyDome,
  type SkyDomeFrame,
  setDomeFog,
  setKeyedGradient,
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

/** Tileable FBM in [0, 1] on a `size`² grid, each octave doubling the frequency. */
const fbm = (basePeriod: number, seed: number, size: number, octaveCount: number): Float32Array => {
  const random = mulberry32(seed);
  const octaves = Array.from({ length: octaveCount }, (_, index) => latticeNoise(basePeriod * 2 ** index, random));
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

/** Break-up tuning shared by the layers; see `cloudCoverage` in the fragment shader. */
const CLOUDS = { warp: 0.35, patch: 0.5, erosion: 0.2, grain: 1, textureSize: 512, octaves: 5 } as const;

/** R: broad cloud masses, G: wispy break-up; two textures feed three layers. */
const cloudTexture = (seed: number): DataTexture => {
  const size = CLOUDS.textureSize;
  const broad = fbm(5, seed, size, CLOUDS.octaves);
  const wisp = fbm(13, seed + 101, size, CLOUDS.octaves);
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
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uMoonColor;
  uniform vec3 uMoonDir;
  uniform float uSunGlow;
  uniform float uStarWeight;
  uniform float uDaylight;
  uniform float uSimSeconds;
  uniform sampler2D uCloudNoise[3];
  uniform vec2 uDrift[3];
  uniform float uScale[3];
  uniform float uOpacity[3];
  uniform float uAngle[3];
  uniform float uWarp;
  uniform float uPatch;
  uniform float uErosion;
  uniform float uGrain;
  ${DOME_GLSL}
  ${KEYED_GLSL}
  // One layer's cover at a sky-plane point. A tiling texture repeats, so the lookup is
  // rotated per layer, warped by the texture's own low octave and eroded by a fine one, and
  // the sky-wide patch field shifts the threshold; together they hide the tile period.
  float cloudCoverage ( sampler2D tex, vec2 plane, float scale, vec2 drift, float angle, float patchBias ) {
    float c = cos( angle );
    float s = sin( angle );
    vec2 uv = mat2( c, s, -s, c ) * plane * scale + drift * uSimSeconds;
    uv += ( texture2D( tex, uv * 0.31 + vec2( 0.37, 0.71 ) ).rg - 0.5 ) * uWarp;
    vec2 noise = texture2D( tex, uv ).rg;
    float erosion = ( texture2D( tex, uv * 4.3 + vec2( 0.61, 0.23 ) ).g - 0.5 ) * uErosion;
    return smoothstep( 0.45, 0.75, noise.r + ( noise.g - 0.5 ) * 0.35 + erosion + patchBias );
  }
  void main () {
    vec3 dir = normalize( vDir );
    vec3 col = domeKeyed( dir );
    col += domeSun( dir, uSunDir, uSunColor, uSunGlow );
    col += domeSun( dir, uMoonDir, uMoonColor, 0.3 );
    col += domeStars( dir, uStarWeight );
    float horizonFade = smoothstep( 0.02, 0.14, dir.y );
    vec3 cloudLight = uSunColor * uDaylight * 0.8 + vec3( 0.045, 0.055, 0.075 );
    // GLSL ES 1.0 needs literal sampler indices, so the three layers are unrolled.
    float sunSide = 0.6 + 0.4 * clamp( dot( dir, uSunDir ), 0.0, 1.0 );
    vec3 litCloud = cloudLight * sunSide;
    vec2 plane = dir.xz / max( dir.y, 0.06 );
    // Clear and overcast regions: a broad field every layer shares, so they thin out together.
    float patchBias = ( texture2D( uCloudNoise[1], plane * 0.05 + uDrift[0] * uSimSeconds * 0.2 ).r - 0.5 ) * uPatch;
    float cover0 = cloudCoverage( uCloudNoise[0], plane, uScale[0], uDrift[0], uAngle[0], patchBias );
    col = mix( col, litCloud, cover0 * uOpacity[0] * horizonFade );
    float cover1 = cloudCoverage( uCloudNoise[1], plane, uScale[1], uDrift[1], uAngle[1], patchBias );
    col = mix( col, litCloud, cover1 * uOpacity[1] * horizonFade );
    float cover2 = cloudCoverage( uCloudNoise[2], plane, uScale[2], uDrift[2], uAngle[2], patchBias );
    col = mix( col, litCloud, cover2 * uOpacity[2] * horizonFade );
    // Sub-step dither breaks the 8-bit bands of the soft gradients.
    col += ( domeHash( gl_FragCoord.xy ) - 0.5 ) * uGrain / 255.0;
    gl_FragColor = domeOutput( col, dir );
    #include <colorspace_fragment>
  }
`;

/** Scales sit at non-integer ratios and angles apart, so no two layers' tiles line up. */
const LAYERS = [
  { texture: 0, scale: 0.35, angle: 0, drift: new Vector2(0.0006, 0.000_13), opacity: 0.32 },
  { texture: 1, scale: 0.83, angle: 2.1, drift: new Vector2(-0.0011, 0.0004), opacity: 0.5 },
  { texture: 0, scale: 2.07, angle: 4.0, drift: new Vector2(0.0028, -0.0019), opacity: 0.42 },
] as const;

const setSrgb = (into: Color, [r, g, b]: Rgb): Color => into.setRGB(r, g, b, SRGBColorSpace);

/** The layered spike: the dome's mesh joins the scene; dispose removes it. */
export const createLayeredSkyDome = (): SkyDome => {
  const textures = [cloudTexture(1), cloudTexture(2)];
  const output = domeOutputUniforms();
  const keyed = keyedGradientUniforms();
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      ...output,
      ...keyed,
      uSunColor: { value: new Color(0, 0, 0) },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uMoonColor: { value: new Color(0.65, 0.7, 0.8) },
      uMoonDir: { value: new Vector3(0, -1, 0) },
      uSunGlow: { value: 0.5 },
      uStarWeight: { value: 0 },
      uDaylight: { value: 1 },
      uSimSeconds: { value: 0 },
      uCloudNoise: { value: LAYERS.map((layer) => textures[layer.texture]!) },
      uDrift: { value: LAYERS.map((layer) => layer.drift) },
      uScale: { value: LAYERS.map((layer) => layer.scale) },
      uOpacity: { value: LAYERS.map((layer) => layer.opacity) },
      uAngle: { value: LAYERS.map((layer) => layer.angle) },
      uWarp: { value: CLOUDS.warp },
      uPatch: { value: CLOUDS.patch },
      uErosion: { value: CLOUDS.erosion },
      uGrain: { value: CLOUDS.grain },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
  const mesh = domeMesh(material);
  const update = ({ sky, simSeconds, camera, skyVisibility }: SkyDomeFrame): void => {
    const { uniforms } = material;
    setKeyedGradient(keyed, sky);
    setDomeFog(output, sky, skyVisibility);
    (uniforms.uSunDir!.value as Vector3).set(...sky.sunDirection);
    (uniforms.uMoonDir!.value as Vector3).set(-sky.sunDirection[0], -sky.sunDirection[1], -sky.sunDirection[2]);
    setSrgb(uniforms.uSunColor!.value as Color, sky.lightColor);
    uniforms.uSunGlow!.value = Math.min(1, sky.lightIntensity);
    uniforms.uStarWeight!.value = starWeightOf(sky);
    uniforms.uDaylight!.value = Math.min(1, Math.max(0, sky.sunDirection[1] * 3));
    uniforms.uSimSeconds!.value = simSeconds;
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
