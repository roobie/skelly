// The sky dome: one camera-following sphere that stands in for the flat background. A look's `dome` block
// (engine/core/sky.ts, `Dome`) supplies the keyed gradient, the physical sky's terms, cloud cover, stars and moon; the
// day cycle's `clouds` supply the layers' shape and its `domeShape` the gradient's bands, the star density and the
// cloud light. The rules that stay in code are the physical sky giving way to the gradient around a low sun, the
// fade into the fog colour at the horizon, and cloud light from the main light.
//
// The sun and its glow are painted rather than taken from the physical sky. Around a low sun the model's radiance
// falls by a hundred times within twenty degrees and swings from red through green to blue, which reads only when a
// per-channel curve burns it to white; and its disc takes the air's extinction, which leaves it redder and darker than
// the sky beside it. Bloom cannot supply the glow either, because the sky stays out of bloom.
//
// It is drawn the way the background it replaces is: never tone-mapped on the screen path, and in the post chain
// scaled with the clear colour and the fog by `Mood` (render/mood.ts, `Mood.draw`) through `skyDomeUniforms`.
// A dome that skipped either would not meet the fogged geometry at the horizon.
//
// The physical sky, the sun, the moon and the lit clouds are radiance in arbitrary units, so the composited colour
// is brought into display range once by a shoulder that keeps its hue (`toDisplay`). That keeps the sky at or under
// 1 whatever the content, as `targetColorScale` in engine/core/mood.ts assumes of any sky colour, so it never counts
// as bright to the bloom pass and the largest colour scale cannot push the sun's disc out of half-float range. The
// shoulder starts at the keyed gradient's own brightness, so a flat look (gradient stops all the fog colour, no
// physical weight, cover, stars, moon or sun) draws exactly the flat background.

import type { Clouds, DomeShape, Rgb, Sky } from '@skelly/engine/sky';
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
  Vector2,
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

/** How much of the physical sky a sun at this height allows: none around a low sun, all of it with the sun high. */
export const physicalShare = (sunHeight: number, [from, to]: readonly [number, number]): number =>
  clamp01((sunHeight - from) / (to - from));

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
  uniform vec2 uHorizonBand;
  uniform vec2 uGlowBand;
  uniform float uStarThreshold;
  uniform float uStarSize;
  uniform float uStarTwinkle;
  uniform vec2 uMoonDisc;
  uniform float uMoonDiscGain;
  uniform vec2 uMoonTightHalo;
  uniform vec2 uMoonWideHalo;
  uniform float uCoverGain;
  uniform float uEdgeSoftness;
  uniform vec2 uCloudFade;
  uniform float uCloudFacing;
  uniform float uPhysicalExposure;
  uniform float uMoonBrightness;
  uniform vec3 uHorizonGlow;
  uniform vec3 uHorizon;
  uniform float uPhysicalWeight;
  uniform vec3 uSunDir;
  uniform float uSunIntensity;
  uniform vec3 uBetaR;
  uniform vec3 uBetaM;
  uniform float uMieDirectional;
  uniform vec3 uMoonDir;
  uniform vec3 uMoonColour;
  uniform vec2 uSunDisc;
  uniform float uSunDiscGain;
  uniform vec2 uSunTightHalo;
  uniform vec2 uSunWideHalo;
  uniform vec3 uSunColour;
  uniform float uSunBrightness;
  uniform vec3 uSunGlowColour;
  uniform float uSunGlow;
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
  // Brightness up to the knee passes unchanged; above it the brightest channel eases towards 1, scaling the others
  // with it so a bright sky keeps its hue instead of clipping to white per channel. The knee is never below the
  // keyed gradient's own brightness, which therefore always passes whole.
  const float SHOULDER_KNEE = 0.6;

  vec3 toDisplay ( vec3 radiance, vec3 keyed ) {
    float peak = max( radiance.r, max( radiance.g, radiance.b ) );
    float knee = clamp( max( SHOULDER_KNEE, max( keyed.r, max( keyed.g, keyed.b ) ) ), 0.0, 1.0 );
    if ( peak <= knee ) {
      return radiance;
    }
    float room = 1.0 - knee;
    if ( room <= 0.0 ) {
      return radiance / peak;
    }
    return radiance * ( ( knee + room * ( 1.0 - exp( -( peak - knee ) / room ) ) ) / peak );
  }

  vec3 keyedSky ( vec3 dir ) {
    vec3 col = mix( uHorizonGlow, uZenith, smoothstep( uGlowBand.x, uGlowBand.y, dir.y ) );
    return mix( uHorizon, col, smoothstep( uHorizonBand.x, uHorizonBand.y, dir.y ) );
  }

  // Preetham's analytic daylight (three's Sky addon, less its clouds and its sun disc).
  vec3 physicalSky ( vec3 dir ) {
    float zenithAngle = acos( clamp( dir.y, 0.0, 1.0 ) );
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
    return ( ( inScatter + vec3( 0.1 ) * extinction ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 ) ) * uPhysicalExposure;
  }

  float hash ( vec2 cell ) {
    return fract( sin( dot( cell, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
  }

  float stars ( vec3 dir ) {
    vec2 sph = vec2( atan( dir.z, dir.x ) * 38.2, asin( clamp( dir.y, -1.0, 1.0 ) ) * 76.4 );
    vec2 cell = floor( sph );
    vec2 inCell = fract( sph ) - vec2( hash( cell ), hash( cell + 19.7 ) );
    float star = ( 1.0 - smoothstep( 0.0, uStarSize, length( inCell ) ) ) * step( uStarThreshold, hash( cell + 7.3 ) );
    float twinkle = 1.0 - uStarTwinkle * ( 1.0 - hash( cell + 3.1 ) );
    return star * twinkle * smoothstep( 0.0, 0.25, dir.y );
  }

  // A lobe of light round a body, as cos(angle) ** power * gain; shape is power, gain.
  float lobe ( float cosAngle, vec2 shape ) {
    return pow( cosAngle, shape.x ) * shape.y;
  }

  vec3 moon ( vec3 dir ) {
    float d = clamp( dot( dir, uMoonDir ), 0.0, 1.0 );
    float disc = smoothstep( uMoonDisc.x, uMoonDisc.y, d );
    return uMoonColour * ( disc * uMoonDiscGain + lobe( d, uMoonTightHalo ) + lobe( d, uMoonWideHalo ) );
  }

  vec3 sunDisc ( float cosAngle ) {
    return uSunColour * ( smoothstep( uSunDisc.x, uSunDisc.y, cosAngle ) * uSunDiscGain * uSunBrightness );
  }

  vec3 sunGlow ( float cosAngle ) {
    return ( uSunColour * lobe( cosAngle, uSunTightHalo ) + uSunGlowColour * lobe( cosAngle, uSunWideHalo ) ) * uSunGlow;
  }

  // One layer's cover at a sky-plane point. A tiling texture repeats, so the lookup is rotated per layer and
  // warped by the texture's own low octave, which hides the tile period. layer: scale, angle, drift x and y.
  float cloudCover ( sampler2D tex, vec2 plane, vec4 layer ) {
    float c = cos( layer.y );
    float s = sin( layer.y );
    vec2 uv = mat2( c, s, -s, c ) * plane * layer.x + layer.zw * uSimSeconds;
    uv += ( texture2D( tex, uv * 0.31 + vec2( 0.37, 0.71 ) ).rg - 0.5 ) * uWarp;
    vec2 noise = texture2D( tex, uv ).rg;
    float threshold = 1.0 - uCoverGain * uCover;
    // Cover 0 is clear sky however high the noise rises.
    return smoothstep( threshold, threshold + uEdgeSoftness, noise.r + ( noise.g - 0.5 ) * 0.35 ) * step( 0.0001, uCover );
  }

  void main () {
    vec3 dir = normalize( vDir );
    vec3 keyed = keyedSky( dir );
    vec3 physical = physicalSky( dir );
    vec3 col = mix( keyed, physical, uPhysicalWeight );
    float sunCos = clamp( dot( dir, uSunDir ), 0.0, 1.0 );
    col += vec3( stars( dir ) * uStars ) + moon( dir ) * uMoonBrightness + sunDisc( sunCos );

    // Clouds come last, so they cover the stars, the moon and the sun behind them.
    float cloudOpacity = uCloudOpacity * smoothstep( uCloudFade.x, uCloudFade.y, dir.y );
    vec3 litCloud = uCloudAmbient + uCloudLight * ( 1.0 - uCloudFacing + uCloudFacing * clamp( dot( dir, uLightDir ), 0.0, 1.0 ) );
    vec2 plane = dir.xz / max( dir.y, 0.06 );
    ${Array.from({ length: layers }, (_, index) => layerGlsl(index)).join('')}

    // The glow is lit air between the eye and the clouds, so it goes over them.
    col += sunGlow( sunCos );

    col = toDisplay( col, keyed );
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
export const createSkyDome = (clouds: Clouds, shape: DomeShape): SkyDome => {
  const textures: DataTexture[] = TEXTURE_SEEDS.map((seed) => cloudTexture(seed));
  const uniforms = {
    ...skyDomeUniforms,
    uFogColor: { value: new Color() },
    uSkyVisibility: { value: 1 },
    uZenith: { value: new Color() },
    uHorizonBand: { value: new Vector2(...shape.horizonBand) },
    uGlowBand: { value: new Vector2(...shape.glowBand) },
    uStarThreshold: { value: 1 - shape.starField.density },
    uStarSize: { value: shape.starField.size },
    uStarTwinkle: { value: shape.starField.twinkle },
    uMoonDisc: { value: new Vector2(...shape.moon.disc) },
    uMoonDiscGain: { value: shape.moon.discGain },
    uMoonTightHalo: { value: new Vector2(shape.moon.tightHalo.power, shape.moon.tightHalo.gain) },
    uMoonWideHalo: { value: new Vector2(shape.moon.wideHalo.power, shape.moon.wideHalo.gain) },
    uCoverGain: { value: shape.cloudShape.coverGain },
    uEdgeSoftness: { value: shape.cloudShape.edgeSoftness },
    uCloudFade: { value: new Vector2(...shape.cloudShape.horizonFade) },
    uCloudFacing: { value: shape.cloudLight.facing },
    uPhysicalExposure: { value: 0 },
    uMoonBrightness: { value: 0 },
    uHorizonGlow: { value: new Color() },
    uHorizon: { value: new Color() },
    uPhysicalWeight: { value: 0 },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunIntensity: { value: 0 },
    uBetaR: { value: new Vector3() },
    uBetaM: { value: new Vector3() },
    uMieDirectional: { value: 0 },
    uMoonDir: { value: new Vector3(0, -1, 0) },
    uMoonColour: { value: new Color() },
    uSunDisc: { value: new Vector2(...shape.sun.disc) },
    uSunDiscGain: { value: shape.sun.discGain },
    uSunTightHalo: { value: new Vector2(shape.sun.tightHalo.power, shape.sun.tightHalo.gain) },
    uSunWideHalo: { value: new Vector2(shape.sun.wideHalo.power, shape.sun.wideHalo.gain) },
    uSunColour: { value: new Color() },
    uSunBrightness: { value: 0 },
    uSunGlowColour: { value: new Color() },
    uSunGlow: { value: 0 },
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
      uniforms.uPhysicalWeight.value = dome.physical.weight * physicalShare(sunDirection[1], shape.physicalBand);
      uniforms.uSunDir.value.set(...sunDirection);
      uniforms.uSunIntensity.value = terms.sunIntensity;
      uniforms.uBetaR.value.set(...terms.rayleigh);
      uniforms.uBetaM.value.set(...terms.mie);
      uniforms.uMieDirectional.value = dome.physical.mieDirectional;
      uniforms.uMoonDir.value.set(-sunDirection[0], -sunDirection[1], -sunDirection[2]);
      uniforms.uStars.value = dome.stars;
      uniforms.uPhysicalExposure.value = dome.physical.exposure;
      uniforms.uMoonBrightness.value = dome.moon.brightness;
      setSrgb(uniforms.uMoonColour.value, dome.moon.colour);
      setSrgb(uniforms.uSunColour.value, dome.sun.colour);
      uniforms.uSunBrightness.value = dome.sun.brightness;
      setSrgb(uniforms.uSunGlowColour.value, dome.sun.glowColour);
      uniforms.uSunGlow.value = dome.sun.glow;
      uniforms.uCover.value = dome.clouds.cover;
      uniforms.uCloudOpacity.value = dome.clouds.opacity;
      uniforms.uSimSeconds.value = simSeconds;
      uniforms.uLightDir.value.set(...sky.light);
      setSrgb(uniforms.uCloudLight.value, sky.lightColor).multiplyScalar(
        clamp01(sky.lightIntensity) * shape.cloudLight.light,
      );
      setSrgb(uniforms.uCloudAmbient.value, sky.ambientSky).multiplyScalar(
        clamp01(sky.ambientIntensity) * shape.cloudLight.ambient,
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
