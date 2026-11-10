// The sky dome: one camera-following sphere that stands in for the flat background. A look's `dome` block
// (engine/core/sky.ts, `Dome`) supplies the keyed gradient, the physical sky's terms, cloud cover and stars; the
// day cycle's `clouds` supply the layers' shape. The rules that stay in code are the physical sky floored at the
// gradient around a low sun, the fade into the fog colour at the horizon, and cloud light from the main light.
//
// It is drawn the way the background it replaces is: never tone-mapped on the screen path, and in the post chain
// scaled with the clear colour and the fog by `Mood` (render/mood.ts, `Mood.draw`) through `skyDomeUniforms`.
// A dome that skipped either would not meet the fogged geometry at the horizon.
//
// The sun disc belongs to the physical sky, and the moon and stars to the stars' brightness, so a flat look
// (gradient stops all the fog colour, no physical weight, cover or stars) draws exactly the flat background.

import type { Clouds, Rgb, Sky } from '@skelly/engine/sky';
import {
  BackSide,
  Color,
  type DataTexture,
  type IUniform,
  Mesh,
  type PerspectiveCamera,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  Vector4,
} from 'three';
import { cloudTexture } from './skyCloudNoise.ts';

/** Shared by the dome's material; `Mood` sets the scale for the post chain's frame only. */
export const skyDomeUniforms: { uSkyColorScale: IUniform<number> } = {
  uSkyColorScale: { value: 1 },
};

/** What the dome needs per frame; render/sky.ts has already applied `sky`. */
export interface SkyDomeFrame {
  sky: Sky;
  /** Simulation seconds, so cloud drift follows the world clock. */
  simSeconds: number;
  camera: PerspectiveCamera;
  /** Diffuse sky visibility where the camera stands; dims the dome indoors. */
  skyVisibility: number;
}

export interface SkyDome {
  readonly mesh: Mesh;
  update: (frame: SkyDomeFrame) => void;
  /** True hides the dome, so the crack check's magenta shows through the background. */
  setHidden: (hidden: boolean) => void;
  dispose: () => void;
}

/** Scales the Preetham model's radiance to the keyed sky's brightness, where the two meet at midday. */
const PHYSICAL_EXPOSURE = 0.35;

/** The sun's height over which the keyed floor fades out: full below the first, none above the second. */
const FLOOR_FROM_SUN_HEIGHT = 0.05;
const FLOOR_TO_SUN_HEIGHT = 0.3;

/** How much of the main light's colour and the ambient sky colour a cloud takes. */
const CLOUD_LIGHT_GAIN = 0.8;
const CLOUD_AMBIENT_GAIN = 0.25;

const MOON_COLOUR: Rgb = [0.7, 0.75, 0.85];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const setSrgb = (into: Color, [r, g, b]: Rgb): Color => into.setRGB(r, g, b, SRGBColorSpace);

// The Preetham model's constants, from three's Sky addon ("A Practical Analytic Model for Daylight").
const TOTAL_RAYLEIGH: Rgb = [5.804_542_996_261_093e-6, 1.356_291_141_984_563_5e-5, 3.026_590_246_882_487_6e-5];
const MIE_CONST: Rgb = [1.839_991_851_443_397_8e14, 2.779_802_391_966_052_8e14, 4.079_047_954_386_109_4e14];
const SUN_CUTOFF_ANGLE = 1.611_073_155_687_073_4;
const SUN_STEEPNESS = 1.5;
const SUN_PEAK_INTENSITY = 1000;

/** The model's terms that depend on the sun and the atmosphere but not on the view direction. */
export interface PreethamTerms {
  /** Zero once the sun is far enough below the horizon. */
  sunIntensity: number;
  rayleigh: Rgb;
  mie: Rgb;
}

export const preethamTerms = (
  sunHeight: number,
  { turbidity, rayleigh, mie }: Sky['dome']['physical'],
): PreethamTerms => {
  const zenithAngle = Math.acos(Math.min(1, Math.max(-1, sunHeight)));
  const sunIntensity =
    SUN_PEAK_INTENSITY * Math.max(0, 1 - Math.exp(-((SUN_CUTOFF_ANGLE - zenithAngle) / SUN_STEEPNESS)));
  const mieScale = Math.LOG10E * (0.2 * turbidity * 10e-18) * mie;
  const scaled = (betas: Rgb, factor: number): Rgb => [betas[0] * factor, betas[1] * factor, betas[2] * factor];
  return { sunIntensity, rayleigh: scaled(TOTAL_RAYLEIGH, rayleigh), mie: scaled(MIE_CONST, mieScale) };
};

/** How far the physical sky is lifted to the keyed gradient: fully around a low sun, not at all with it high. */
export const keyedFloor = (sunHeight: number): number =>
  1 - clamp01((sunHeight - FLOOR_FROM_SUN_HEIGHT) / (FLOOR_TO_SUN_HEIGHT - FLOOR_FROM_SUN_HEIGHT));

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vDir;
  void main () {
    // Unit sphere at the camera: the local position is the view direction.
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

/** Layer `index` of the cloud field over `col`. Literal indices keep sampler use legal in GLSL ES 1.0. */
const layerGlsl = (index: number): string => /* glsl */ `
    col = mix( col, litCloud, cloudCover( ${index % 2 === 0 ? 'uCloudA' : 'uCloudB'}, plane, uLayer[${index}] )
      * uLayerOpacity[${index}] * cloudOpacity );`;

const fragmentShader = (layers: number): string => /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uFogColor;
  uniform float uSkyVisibility;
  uniform float uSkyColorScale;
  uniform vec3 uZenith;
  uniform vec3 uHorizonGlow;
  uniform vec3 uHorizon;
  uniform float uPhysicalWeight;
  uniform float uKeyedFloor;
  uniform vec3 uSunDir;
  uniform float uSunIntensity;
  uniform vec3 uBetaR;
  uniform vec3 uBetaM;
  uniform float uMieDirectional;
  uniform vec3 uMoonDir;
  uniform vec3 uMoonColour;
  uniform float uStars;
  uniform float uCover;
  uniform float uCloudOpacity;
  uniform float uWarp;
  uniform float uSimSeconds;
  uniform vec3 uLightDir;
  uniform vec3 uCloudLight;
  uniform vec3 uCloudAmbient;
  uniform sampler2D uCloudA;
  uniform sampler2D uCloudB;
  uniform vec4 uLayer[${layers}];
  uniform float uLayerOpacity[${layers}];

  const float RAYLEIGH_ZENITH_LENGTH = 8.4E3;
  const float MIE_ZENITH_LENGTH = 1.25E3;
  const float SUN_ANGULAR_DIAMETER_COS = 0.999956676946448;

  vec3 keyedSky ( vec3 dir ) {
    vec3 col = mix( uHorizonGlow, uZenith, smoothstep( 0.12, 0.55, dir.y ) );
    return mix( uHorizon, col, smoothstep( 0.015, 0.14, dir.y ) );
  }

  // Preetham's analytic daylight with its sun disc (three's Sky addon, less its clouds).
  vec3 physicalSky ( vec3 dir ) {
    float zenithAngle = acos( max( 0.0, dir.y ) );
    float airmass = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - degrees( zenithAngle ), -1.253 ) );
    vec3 extinction = exp( -( uBetaR * RAYLEIGH_ZENITH_LENGTH + uBetaM * MIE_ZENITH_LENGTH ) * airmass );
    float cosTheta = dot( dir, uSunDir );
    float rayleighPhase = 0.05968310365946075 * ( 1.0 + pow( cosTheta * 0.5 + 0.5, 2.0 ) );
    float g2 = uMieDirectional * uMieDirectional;
    float miePhase = 0.07957747154594767 * ( 1.0 - g2 ) / pow( 1.0 - 2.0 * uMieDirectional * cosTheta + g2, 1.5 );
    // Zero rayleigh and mie terms are allowed content, so the ratio is guarded against 0 / 0.
    vec3 scattered = uSunIntensity * ( uBetaR * rayleighPhase + uBetaM * miePhase )
      / max( uBetaR + uBetaM, vec3( 1e-12 ) );
    vec3 inScatter = pow( scattered * ( 1.0 - extinction ), vec3( 1.5 ) );
    inScatter *= mix( vec3( 1.0 ), pow( scattered * extinction, vec3( 0.5 ) ),
      clamp( pow( 1.0 - uSunDir.y, 5.0 ), 0.0, 1.0 ) );
    float disc = clamp( ( cosTheta - SUN_ANGULAR_DIAMETER_COS ) * 50000.0, 0.0, 1.0 );
    vec3 discColour = 760.0 * disc * min( uSunIntensity * extinction, 80.0 );
    return ( ( inScatter + vec3( 0.1 ) * extinction ) * 0.04 + discColour + vec3( 0.0, 0.0003, 0.00075 ) )
      * ${PHYSICAL_EXPOSURE.toFixed(2)};
  }

  float hash ( vec2 cell ) {
    return fract( sin( dot( cell, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
  }

  float stars ( vec3 dir ) {
    vec2 sph = vec2( atan( dir.z, dir.x ) * 38.2, asin( clamp( dir.y, -1.0, 1.0 ) ) * 76.4 );
    vec2 cell = floor( sph );
    vec2 inCell = fract( sph ) - vec2( hash( cell ), hash( cell + 19.7 ) );
    float star = smoothstep( 0.12, 0.0, length( inCell ) ) * step( 0.986, hash( cell + 7.3 ) );
    float twinkle = 0.6 + 0.4 * hash( cell + 3.1 );
    return star * twinkle * smoothstep( 0.0, 0.25, dir.y );
  }

  vec3 moon ( vec3 dir ) {
    float d = clamp( dot( dir, uMoonDir ), 0.0, 1.0 );
    float disc = smoothstep( 0.99955, 0.99985, d );
    float halo = pow( d, 350.0 ) * 0.9 + pow( d, 14.0 ) * 0.18;
    return uMoonColour * ( disc * 5.0 + halo * 0.35 );
  }

  // One layer's cover at a sky-plane point. A tiling texture repeats, so the lookup is rotated per layer and
  // warped by the texture's own low octave, which hides the tile period. layer: scale, angle, drift x and y.
  float cloudCover ( sampler2D tex, vec2 plane, vec4 layer ) {
    float c = cos( layer.y );
    float s = sin( layer.y );
    vec2 uv = mat2( c, s, -s, c ) * plane * layer.x + layer.zw * uSimSeconds;
    uv += ( texture2D( tex, uv * 0.31 + vec2( 0.37, 0.71 ) ).rg - 0.5 ) * uWarp;
    vec2 noise = texture2D( tex, uv ).rg;
    float threshold = 1.0 - 1.2 * uCover;
    // Cover 0 is clear sky however high the noise rises.
    return smoothstep( threshold, threshold + 0.3, noise.r + ( noise.g - 0.5 ) * 0.35 ) * step( 0.0001, uCover );
  }

  void main () {
    vec3 dir = normalize( vDir );
    vec3 keyed = keyedSky( dir );
    vec3 physical = physicalSky( dir );
    physical = mix( physical, max( physical, keyed ), uKeyedFloor );
    vec3 col = mix( keyed, physical, uPhysicalWeight );
    col += ( stars( dir ) + moon( dir ) ) * uStars;

    // Clouds come last, so they cover the stars, the moon and the sun behind them.
    float cloudOpacity = uCloudOpacity * smoothstep( 0.02, 0.14, dir.y );
    vec3 litCloud = uCloudAmbient + uCloudLight * ( 0.6 + 0.4 * clamp( dot( dir, uLightDir ), 0.0, 1.0 ) );
    vec2 plane = dir.xz / max( dir.y, 0.06 );
    ${Array.from({ length: layers }, (_, index) => layerGlsl(index)).join('')}

    col *= uSkyVisibility;
    col = mix( col, uFogColor, 1.0 - smoothstep( 0.0, 0.06, dir.y ) );
    gl_FragColor = vec4( col * uSkyColorScale, 1.0 );
    #include <colorspace_fragment>
  }
`;

/** Centres the dome on the camera, inside the far plane, which follows the fog (render/sky.ts). */
const placeDome = (mesh: Mesh, camera: PerspectiveCamera): void => {
  mesh.position.copy(camera.position);
  mesh.scale.setScalar(Math.max(1, camera.far * 0.5));
};

/** Two textures serve every layer in turn, so neighbouring layers never share a pattern. */
const TEXTURE_SEEDS = [1, 2] as const;

/** The mesh is for the caller to add to the scene; `dispose` frees what the dome owns. */
export const createSkyDome = (clouds: Clouds): SkyDome => {
  const textures: DataTexture[] = TEXTURE_SEEDS.map((seed) => cloudTexture(seed));
  const uniforms = {
    ...skyDomeUniforms,
    uFogColor: { value: new Color() },
    uSkyVisibility: { value: 1 },
    uZenith: { value: new Color() },
    uHorizonGlow: { value: new Color() },
    uHorizon: { value: new Color() },
    uPhysicalWeight: { value: 0 },
    uKeyedFloor: { value: 0 },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunIntensity: { value: 0 },
    uBetaR: { value: new Vector3() },
    uBetaM: { value: new Vector3() },
    uMieDirectional: { value: 0 },
    uMoonDir: { value: new Vector3(0, -1, 0) },
    uMoonColour: { value: setSrgb(new Color(), MOON_COLOUR) },
    uStars: { value: 0 },
    uCover: { value: 0 },
    uCloudOpacity: { value: 0 },
    uWarp: { value: clouds.warp },
    uSimSeconds: { value: 0 },
    uLightDir: { value: new Vector3(0, 1, 0) },
    uCloudLight: { value: new Color() },
    uCloudAmbient: { value: new Color() },
    uCloudA: { value: textures[0]! },
    uCloudB: { value: textures[1]! },
    uLayer: { value: clouds.layers.map((layer) => new Vector4(layer.scale, layer.angle, ...layer.drift)) },
    uLayerOpacity: { value: clouds.layers.map((layer) => layer.opacity) },
  };
  const material = new ShaderMaterial({
    name: 'SkyDome',
    side: BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: fragmentShader(clouds.layers.length),
  });
  const mesh = new Mesh(new SphereGeometry(1, 48, 24), material);
  mesh.name = 'skyDome';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return {
    mesh,
    update({ sky, simSeconds, camera, skyVisibility }: SkyDomeFrame): void {
      const { dome, sunDirection } = sky;
      const terms = preethamTerms(sunDirection[1], dome.physical);
      setSrgb(uniforms.uFogColor.value, sky.sky).multiplyScalar(skyVisibility);
      uniforms.uSkyVisibility.value = skyVisibility;
      setSrgb(uniforms.uHorizon.value, sky.sky);
      setSrgb(uniforms.uHorizonGlow.value, dome.horizonGlow);
      setSrgb(uniforms.uZenith.value, dome.zenith);
      uniforms.uPhysicalWeight.value = dome.physical.weight;
      uniforms.uKeyedFloor.value = keyedFloor(sunDirection[1]);
      uniforms.uSunDir.value.set(...sunDirection);
      uniforms.uSunIntensity.value = terms.sunIntensity;
      uniforms.uBetaR.value.set(...terms.rayleigh);
      uniforms.uBetaM.value.set(...terms.mie);
      uniforms.uMieDirectional.value = dome.physical.mieDirectional;
      uniforms.uMoonDir.value.set(-sunDirection[0], -sunDirection[1], -sunDirection[2]);
      uniforms.uStars.value = dome.stars;
      uniforms.uCover.value = dome.clouds.cover;
      uniforms.uCloudOpacity.value = dome.clouds.opacity;
      uniforms.uSimSeconds.value = simSeconds;
      uniforms.uLightDir.value.set(...sky.light);
      setSrgb(uniforms.uCloudLight.value, sky.lightColor).multiplyScalar(
        clamp01(sky.lightIntensity) * CLOUD_LIGHT_GAIN,
      );
      setSrgb(uniforms.uCloudAmbient.value, sky.ambientSky).multiplyScalar(
        clamp01(sky.ambientIntensity) * CLOUD_AMBIENT_GAIN,
      );
      placeDome(mesh, camera);
    },
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
