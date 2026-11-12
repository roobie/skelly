// The sky dome: one camera-following sphere that stands in for the flat background. A look's `dome` block
// (engine/core/sky.ts, `Dome`) supplies the keyed gradient, the physical sky's terms, cloud cover, stars, moon and
// sun; the day cycle's `clouds` supply each kind of cloud's shape and its `domeShape` the gradient's bands, the star
// density, the bodies' shapes and the cloud light. The rules that stay in code are the physical sky giving way to the
// gradient around a low sun, the fade into the fog colour at the horizon, and cloud light from the main light.
//
// Both kinds of cloud are compiled in, so the weather can move between them without rebuilding the shader; the
// weather's share of each sets which shows (engine/core/weather.ts, `skyInWeather`).
//
// The sun and its glow are painted rather than taken from the physical sky. Around a low sun the model's radiance
// falls off steeply with angle and swings from red through green to blue, which reads only when a per-channel curve
// burns it to white; and its disc takes the air's extinction, which leaves it redder and darker than
// the sky beside it. Bloom cannot supply the glow either, because the sky stays out of bloom.
//
// It is drawn the way the background it replaces is: never tone-mapped on the screen path, and in the post chain
// scaled with the clear colour and the fog by `Mood` (render/mood.ts, `Mood.draw`) through `skyDomeUniforms`.
// A dome that skipped either would not meet the fogged geometry at the horizon.
//
// It draws after the opaque geometry, its depth pinned to the far plane, so only the pixels no geometry covered
// are shaded: the dome's fragment is the frame's dearest per pixel, and drawn first it would pay that cost under
// every wall and hill before geometry drew over it. The pin, not the sphere's own depth, keeps it behind every
// drawn surface, so it never replaces one; the transparent list three.js always draws later still blends over it.
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
  LessEqualDepth,
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
  /** The dome as it draws under open sky, unscaled by the post chain and centred on the origin, for the sky's reflection. */
  readonly openSky: Mesh;
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
    // The dome draws after the opaque geometry and shades only what no geometry covered, so its
    // depth is the far plane's own: never in front of a drawn surface, equal to the cleared depth
    // where nothing drew, which the material's depth test lets pass.
    gl_Position.z = gl_Position.w;
  }
`;

/**
 * Layer `index` of the cloud field over `col`, lit between the tops' light and the deck's by its shade. Literal indices
 * keep sampler use legal in GLSL ES 1.0.
 */
const layerGlsl = (index: number): string => /* glsl */ `
    if ( uLayerOpacity[${index}] > 0.0 ) {
      col = mix( col, mix( litTops, litDeck, uLayerShade[${index}] ),
        cloudCover( ${index % 2 === 0 ? 'uCloudA' : 'uCloudB'}, plane, uLayer[${index}] ) * uLayerOpacity[${index}] * layeredOpacity );
    }`;

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
  uniform vec3 uCloudDeckLight;
  uniform vec3 uCloudAmbient;
  uniform sampler2D uCloudA;
  uniform sampler2D uCloudB;
  uniform vec4 uLayer[${layers}];
  uniform float uLayerOpacity[${layers}];
  uniform float uLayerShade[${layers}];
  uniform float uScatter;
  uniform vec4 uScatterShape;
  uniform vec2 uScatterDrift;
  uniform vec3 uScatterLight;

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

  const float TAU = 6.283185307179586;
  // The star field's cells to the radian, each way: the spacing and star size the content's star field was tuned
  // against near the horizon, where a player looks most.
  const float STAR_CELLS_PER_RADIAN = 54.0;

  // Cells lie in rings of equal elevation, each ring holding as many whole cells as fit round it, so a cell is about
  // as wide as it is tall, except within a few rings of the zenith, and a ring's seam falls on a cell edge. A star is
  // measured on the sphere, not in cell space, so it is round wherever it stands. Its centre stays a radius inside
  // its cell and below the zenith, so the cell's edge does not cut a star whose radius is up to half a cell, outside
  // those top rings.
  float stars ( vec3 dir ) {
    float row = floor( asin( clamp( dir.y, -1.0, 1.0 ) ) * STAR_CELLS_PER_RADIAN );
    float ringCells = max( 1.0, floor( TAU * cos( ( row + 0.5 ) / STAR_CELLS_PER_RADIAN ) * STAR_CELLS_PER_RADIAN ) );
    vec2 cell = vec2( floor( ( atan( dir.z, dir.x ) / TAU + 0.5 ) * ringCells ), row );
    if ( hash( cell + 7.3 ) < uStarThreshold ) {
      return 0.0;
    }
    float margin = min( uStarSize, 0.5 );
    vec2 centre = cell + margin + vec2( hash( cell ), hash( cell + 19.7 ) ) * ( 1.0 - 2.0 * margin );
    // The top ring stops short of a whole cell at the zenith; past it a star's direction would fold over the pole.
    centre.y = min( centre.y, 0.25 * TAU * STAR_CELLS_PER_RADIAN - margin );
    float azimuth = ( centre.x / ringCells - 0.5 ) * TAU;
    float elevation = centre.y / STAR_CELLS_PER_RADIAN;
    vec3 starDir = vec3( cos( elevation ) * cos( azimuth ), sin( elevation ), cos( elevation ) * sin( azimuth ) );
    float apart = length( dir - starDir ) * STAR_CELLS_PER_RADIAN;
    float star = 1.0 - smoothstep( 0.0, uStarSize, apart );
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

  // The scatter kind's noise, after three's Sky addon: gradient noise from a hash without sin, so every GPU draws the
  // same clouds, summed over octaves that slide past one another so the clouds billow.
  vec2 scatterGradient ( vec2 lattice ) {
    vec3 p = fract( lattice.xyx * vec3( 0.1031, 0.1030, 0.0973 ) );
    p += dot( p, p.yzx + 33.33 );
    return fract( ( p.xx + p.yz ) * p.zy ) * 2.0 - 1.0;
  }

  float scatterNoise ( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
    float a = dot( scatterGradient( i ), f );
    float b = dot( scatterGradient( i + vec2( 1.0, 0.0 ) ), f - vec2( 1.0, 0.0 ) );
    float c = dot( scatterGradient( i + vec2( 0.0, 1.0 ) ), f - vec2( 0.0, 1.0 ) );
    float d = dot( scatterGradient( i + vec2( 1.0, 1.0 ) ), f - vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y ) * 1.6;
  }

  float scatterFbm ( vec2 p, float billow ) {
    float sum = 0.0;
    float amplitude = 1.0;
    for ( int octave = 0; octave < 4; octave ++ ) {
      sum += amplitude * scatterNoise( p );
      amplitude *= 0.5;
      p = p * 2.0 + billow;
    }
    return sum;
  }

  // The scatter kind over col. A cloud is opaque by its depth past the edge; its light is dimmed towards the
  // self-shadowed core by a Beer and powder term, and its rim shines through a forward Henyey-Greenstein lobe when the
  // light stands behind it. shape: scale, billow, region scale and strength; light: density, shadow, lining.
  vec3 scatterClouds ( vec3 col, vec3 dir, vec2 plane, float facing, float opacity ) {
    vec2 p = plane * uScatterShape.x + uScatterDrift * uSimSeconds;
    float noise = clamp( scatterFbm( p, uScatterShape.y * uSimSeconds ) * 0.7 + 0.5, 0.0, 1.0 );
    float region = scatterNoise( p * ( uScatterShape.z / uScatterShape.x ) ) * uScatterShape.w;
    float threshold = 1.0 - clamp( uCoverGain * uCover + region, 0.0, 1.0 );
    float depth = max( 0.0, noise - threshold );
    float beer = exp( -4.0 * depth );
    float core = mix( uScatterLight.y, 1.0, clamp( beer * ( 1.0 - beer * beer ) * 2.6, 0.0, 1.0 ) );
    float edge = smoothstep( threshold, threshold + uEdgeSoftness, noise );
    float lightCos = dot( dir, uLightDir );
    float lining = clamp( 0.51 / pow( 1.49 - 1.4 * lightCos, 1.5 ), 0.0, 3.0 ) * edge * ( 1.0 - edge ) * 4.0;
    vec3 lit = uCloudAmbient + uCloudLight * ( facing * core + lining * uScatterLight.z );
    return mix( col, lit, ( 1.0 - exp( -uScatterLight.x * depth ) ) * opacity );
  }

  void main () {
    vec3 dir = normalize( vDir );
    vec3 keyed = keyedSky( dir );
    float sunCos = clamp( dot( dir, uSunDir ), 0.0, 1.0 );
    // A term whose weight is zero leaves the colour bit-for-bit as it was, so it is skipped whole.
    // The physical sky is the dome's dearest per-pixel work, and no look runs it around a low sun:
    // the guard is what a dusk frame lives on.
    vec3 col = keyed;
    if ( uPhysicalWeight > 0.0 ) {
      col = mix( keyed, physicalSky( dir ), uPhysicalWeight );
    }
    vec3 painted = vec3( 0.0 );
    if ( uStars > 0.0 ) {
      painted += vec3( stars( dir ) * uStars );
    }
    if ( uMoonBrightness > 0.0 ) {
      painted += moon( dir ) * uMoonBrightness;
    }
    if ( uSunBrightness > 0.0 ) {
      painted += sunDisc( sunCos );
    }
    col += painted;

    // Clouds cover the stars, the moon and the sun's disc behind them.
    float cloudOpacity = uCloudOpacity * smoothstep( uCloudFade.x, uCloudFade.y, dir.y );
    if ( cloudOpacity > 0.0 && uCover > 0.0 ) {
      // A layer's deck share takes the main light only up to the deck's lower cap while the tops take it up to 1; with
      // one light for every layer a closing cover reads as a flat sheet. A light already under the deck's cap lights
      // deck and tops alike.
      float facing = 1.0 - uCloudFacing + uCloudFacing * clamp( dot( dir, uLightDir ), 0.0, 1.0 );
      vec3 litTops = uCloudAmbient + uCloudLight * facing;
      vec3 litDeck = uCloudAmbient + uCloudDeckLight * facing;
      vec2 plane = dir.xz / max( dir.y, 0.06 );
      // A change of kind fades one kind out as the other fades in; a kind with no share costs nothing.
      float layeredOpacity = cloudOpacity * ( 1.0 - uScatter );
      if ( layeredOpacity > 0.0 ) {
        ${Array.from({ length: layers }, (_, index) => layerGlsl(index)).join('')}
      }
      if ( uScatter > 0.0 ) {
        col = scatterClouds( col, dir, plane, facing, cloudOpacity * uScatter );
      }
    }

    // The glow is lit air between the eye and the clouds, so it goes over them.
    if ( uSunGlow > 0.0 ) {
      col += sunGlow( sunCos );
    }

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
export const createSkyDome = ({ layered, scatter }: Clouds, shape: DomeShape): SkyDome => {
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
    uWarp: { value: layered.warp },
    uSimSeconds: { value: 0 },
    uLightDir: { value: new Vector3(0, 1, 0) },
    uCloudLight: { value: new Color() },
    uCloudDeckLight: { value: new Color() },
    uCloudAmbient: { value: new Color() },
    uCloudA: { value: textures[0]! },
    uCloudB: { value: textures[1]! },
    uLayer: { value: layered.layers.map((layer) => new Vector4(layer.scale, layer.angle, ...layer.drift)) },
    uLayerOpacity: { value: layered.layers.map((layer) => layer.opacity) },
    uLayerShade: { value: layered.layers.map((layer) => layer.shade) },
    uScatter: { value: 0 },
    uScatterShape: {
      value: new Vector4(scatter.scale, scatter.billow, scatter.region.scale, scatter.region.strength),
    },
    uScatterDrift: { value: new Vector2(...scatter.drift) },
    uScatterLight: { value: new Vector3(scatter.density, scatter.shadow, scatter.lining) },
  };
  const domeMaterial = (domeUniforms: typeof uniforms): ShaderMaterial =>
    new ShaderMaterial({
      name: 'SkyDome',
      side: BackSide,
      depthWrite: false,
      // Lets the dome through only where the depth buffer still holds the cleared far plane; see
      // the vertex shader's depth pin.
      depthFunc: LessEqualDepth,
      toneMapped: false,
      uniforms: domeUniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: fragmentShader(layered.layers.length),
    });
  const material = domeMaterial(uniforms);
  const geometry = new SphereGeometry(1, 48, 24);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'skyDome';
  mesh.frustumCulled = false;
  // After every opaque draw (which three.js places before the transparent list whatever the order
  // here), so the depth test leaves the dome only the pixels no geometry covered.
  mesh.renderOrder = 900;
  // Reflections stand for the sky itself, so the bake leaves out what dims the drawn dome where the camera stands.
  // Below the horizon, and blending in just above it, it shows the ambient light's ground colour instead of fog: the same
  // colour the hemisphere light uses, though not its brightness, rather than a lower half as bright as the sky.
  const openUniforms = {
    ...uniforms,
    uSkyColorScale: { value: 1 },
    uSkyVisibility: { value: 1 },
    uFogColor: { value: new Color() },
  };
  const openMaterial = domeMaterial(openUniforms);
  const openSky = new Mesh(geometry, openMaterial);
  openSky.name = 'openSky';
  openSky.frustumCulled = false;
  return {
    mesh,
    openSky,
    update({ sky, simSeconds, camera, skyVisibility }: SkyDomeFrame): void {
      const { dome, sunDirection } = sky;
      const terms = preethamTerms(sunDirection[1], dome.physical);
      setSrgb(uniforms.uFogColor.value, sky.sky).multiplyScalar(skyVisibility);
      setSrgb(openUniforms.uFogColor.value, sky.ambientGround);
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
      uniforms.uScatter.value = dome.clouds.scatter;
      uniforms.uSimSeconds.value = simSeconds;
      uniforms.uLightDir.value.set(...sky.light);
      setSrgb(uniforms.uCloudLight.value, sky.lightColor).multiplyScalar(
        clamp01(sky.lightIntensity) * shape.cloudLight.light,
      );
      setSrgb(uniforms.uCloudDeckLight.value, sky.lightColor).multiplyScalar(
        Math.min(clamp01(sky.lightIntensity), shape.cloudLight.deckLight) * shape.cloudLight.light,
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
      geometry.dispose();
      material.dispose();
      openMaterial.dispose();
      for (const texture of textures) {
        texture.dispose();
      }
    },
  };
};
