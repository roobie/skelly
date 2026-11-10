// Shared scaffold for the sky-dome spikes compared for issue #1505: a camera-following dome
// drawn behind everything, the GLSL pieces every spike shares, and the fog rule that keeps
// the far-plane culling trick in render/sky.ts, applySky, holding: the dome fades into the
// fog colour (already scaled by sky visibility, as the fog is) before the far plane.
//
// The dome stands in for the flat background, so it is drawn the way the background is: never
// tone-mapped on the screen path, and in the post chain scaled with the clear colour and the fog
// by `Mood` (render/mood.ts, `Mood.draw`) through `skyDomeUniforms`. A dome that skipped either
// would not meet the fogged geometry at the horizon, and the spikes would not compare fairly.

import type { Sky } from '@skelly/engine/sky';
import {
  Color,
  type IUniform,
  type Material,
  Mesh,
  type PerspectiveCamera,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';

/** What each spike dome needs per frame; render/sky.ts has already applied `sky`. */
export interface SkyDomeFrame {
  sky: Sky;
  /** Local solar hour in [0, 24) on the game clock. */
  gameHour: number;
  /** Simulation seconds, so cloud drift follows the world clock. */
  simSeconds: number;
  camera: PerspectiveCamera;
  /** Diffuse sky visibility where the camera stands; dims the dome indoors. */
  skyVisibility: number;
}

/** A spike sky dome; `flat` (no dome) stays the default look. */
export interface SkyDome {
  /** Added to the scene by the selector (render/skybox.ts, createSkyDome). */
  readonly mesh: Mesh;
  update: (frame: SkyDomeFrame) => void;
  /** True hides the dome, so the crack check's magenta shows through the background. */
  setHidden: (hidden: boolean) => void;
  dispose: () => void;
}

/** Shared by every dome material; `Mood` sets the scale for the post chain's frame only. */
export const skyDomeUniforms: { uSkyColorScale: IUniform<number> } = {
  uSkyColorScale: { value: 1 },
};

/** The per-material uniforms `domeOutput` reads. */
export interface DomeOutputUniforms {
  uFogColor: IUniform<Color>;
  uSkyVisibility: IUniform<number>;
  /** 1 fades into the fog at the horizon; 0 leaves the pure sky, for a bake the runtime fades. */
  uFogBlend: IUniform<number>;
  uSkyColorScale: IUniform<number>;
}

export const domeOutputUniforms = (): DomeOutputUniforms => ({
  uFogColor: { value: new Color(0, 0, 0) },
  uSkyVisibility: { value: 1 },
  uFogBlend: { value: 1 },
  uSkyColorScale: skyDomeUniforms.uSkyColorScale,
});

/** A unit sphere drawn behind everything; materials must set `side: BackSide` and `toneMapped: false`. */
export const domeMesh = (material: Material): Mesh => {
  const mesh = new Mesh(new SphereGeometry(1, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
};

/** Centres the dome on the camera, inside the far plane, which follows the fog (render/sky.ts). */
export const placeDome = (mesh: Mesh, camera: PerspectiveCamera): void => {
  mesh.position.copy(camera.position);
  mesh.scale.setScalar(Math.max(1, camera.far * 0.5));
};

/** The fog colour in the linear working space, scaled by visibility exactly as the fog is. */
export const setDomeFog = (uniforms: DomeOutputUniforms, sky: Sky, skyVisibility: number): void => {
  uniforms.uFogColor.value.setRGB(sky.sky[0], sky.sky[1], sky.sky[2], SRGBColorSpace).multiplyScalar(skyVisibility);
  uniforms.uSkyVisibility.value = skyVisibility;
};

const between = (low: number, high: number, weight: number): number => low + (high - low) * weight;
const setSrgb = (into: Color, [r, g, b]: Sky['sky']): Color => into.setRGB(r, g, b, SRGBColorSpace);

/** The keyed gradient's stops; `KEYED_GLSL`, `domeKeyed`, reads them. */
export interface KeyedGradientUniforms {
  uZenith: IUniform<Color>;
  uMid: IUniform<Color>;
  uHorizon: IUniform<Color>;
}

export const keyedGradientUniforms = (): KeyedGradientUniforms => ({
  uZenith: { value: new Color(0, 0, 0) },
  uMid: { value: new Color(0, 0, 0) },
  uHorizon: { value: new Color(0, 0, 0) },
});

/**
 * The day cycle's own palette as a sky: the sky colour at the horizon band, warmed by the height
 * mist below it and deepened toward the hemisphere sky above. Nothing new is authored, so content
 * owns the look; a real implementation would author the stops directly.
 */
export const setKeyedGradient = (uniforms: KeyedGradientUniforms, sky: Sky): void => {
  const deep = (channel: 0 | 1 | 2): number => between(sky.ambientSky[channel], sky.sky[channel], 0.35) * 0.75;
  const warm = (channel: 0 | 1 | 2): number => between(sky.heightFogColor[channel], sky.sky[channel], 0.4);
  setSrgb(uniforms.uZenith.value, [deep(0), deep(1), deep(2)]);
  setSrgb(uniforms.uMid.value, sky.sky);
  setSrgb(uniforms.uHorizon.value, [warm(0), warm(1), warm(2)]);
};

/** The keyed gradient in GLSL: `domeKeyed( dir )` is the keyed sky in that direction. */
export const KEYED_GLSL = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  vec3 domeKeyed ( vec3 dir ) {
    vec3 col = mix( uMid, uZenith, smoothstep( 0.12, 0.55, dir.y ) );
    return mix( uHorizon, col, smoothstep( 0.015, 0.14, dir.y ) );
  }
`;

/** Star weight: the sun below the horizon brings the stars in. */
export const starWeightOf = (sky: Sky): number => Math.min(1, Math.max(0, -sky.sunDirection[1] * 5));

/**
 * GLSL shared by the spikes: a hash-cell starfield, a disc sun with halo, and `domeOutput`,
 * which every dome ends with: visibility, the horizon fade into the fog and the chain's scale.
 * Hand-written dome shaders follow it with three's colour-space chunk.
 */
export const DOME_GLSL = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uSkyVisibility;
  uniform float uFogBlend;
  uniform float uSkyColorScale;
  float domeHash ( vec2 cell ) {
    return fract( sin( dot( cell, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
  }
  vec3 domeStars ( vec3 dir, float weight ) {
    if ( weight <= 0.001 || dir.y <= 0.0 ) {
      return vec3( 0.0 );
    }
    vec2 sph = vec2( atan( dir.z, dir.x ) * 38.2, asin( clamp( dir.y, -1.0, 1.0 ) ) * 76.4 );
    vec2 cell = floor( sph );
    vec2 inCell = fract( sph ) - vec2( domeHash( cell ), domeHash( cell + 19.7 ) );
    float star = smoothstep( 0.12, 0.0, length( inCell ) ) * step( 0.986, domeHash( cell + 7.3 ) );
    float twinkle = 0.6 + 0.4 * domeHash( cell + 3.1 );
    return vec3( star * twinkle * weight * smoothstep( 0.0, 0.25, dir.y ) );
  }
  vec3 domeSun ( vec3 dir, vec3 sunDir, vec3 sunColor, float glow ) {
    float d = clamp( dot( dir, sunDir ), 0.0, 1.0 );
    float disc = smoothstep( 0.99955, 0.99985, d );
    float halo = pow( d, 350.0 ) * 0.9 + pow( d, 14.0 ) * 0.18;
    return sunColor * ( disc * 5.0 + halo * glow );
  }
  vec4 domeOutput ( vec3 sky, vec3 dir ) {
    vec3 col = sky * uSkyVisibility;
    float fog = 1.0 - smoothstep( 0.0, 0.06, dir.y );
    col = mix( col, uFogColor, fog * uFogBlend );
    return vec4( col * uSkyColorScale, 1.0 );
  }
`;
