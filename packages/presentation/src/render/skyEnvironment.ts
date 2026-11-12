// The sky's reflection on models; the why is in `packages/deadvox/GRAPHICS.md`, "Look decisions".

import { type RealSeconds, type RealTimestamp, realSeconds } from '@skelly/engine/sim';
import type { Sky, SkyEnvironmentTuning } from '@skelly/engine/sky';
import {
  CubeCamera,
  HalfFloatType,
  type Material,
  type Mesh,
  PMREMGenerator,
  Scene,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { type MaterialPatches, materialPatch } from './materialPatches.ts';

/** The parts of a sky the dome draws from; fog distance, bloom and tone change nothing in it. */
const DRAWN: readonly (keyof Sky)[] = [
  'sky',
  'lightColor',
  'lightIntensity',
  'ambientSky',
  'ambientGround',
  'ambientIntensity',
  'dome',
];

/**
 * Colours and directions span about one unit and change absolutely; larger amounts such as a sun's brightness or the
 * air's turbidity change relative to their size, so one threshold serves every value.
 */
const largestChange = (a: unknown, b: unknown): number => {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return Math.max(
      0,
      ...Object.keys(a).map((key) =>
        largestChange((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
      ),
    );
  }
  return 0;
};

/**
 * Where the sun and the light that follows its arc point. Below the horizon the sun's disc is under the ground fog and
 * the physical sky is off, but the wide glow still lights the twilight sky above it, so these count whenever the sun is
 * up or either sky has glow. At night the light follows the moon instead, and neither the moon nor that light counts;
 * the why is in `packages/deadvox/GRAPHICS.md`, "Look decisions".
 */
const SUN_BORNE: readonly (keyof Sky)[] = ['sunDirection', 'light'];

const sunShows = (sky: Sky): boolean => sky.sunDirection[1] > 0 || sky.dome.sun.glow > 0;

/** How far the drawn sky has moved between two skies: the largest change in any value the dome draws from. */
const drawnSkyChange = (a: Sky, b: Sky): number =>
  Math.max(
    ...DRAWN.map((key) => largestChange(a[key], b[key])),
    ...(sunShows(a) || sunShows(b) ? SUN_BORNE.map((key) => largestChange(a[key], b[key])) : []),
  );

/**
 * Decides when the reflection is stale, measured against the sky last baked so slow drift adds up to a bake. The
 * returned check is true when the sky has moved past the threshold and `minInterval` real seconds have passed since
 * the last bake, and then records it as baked. A fast-forwarded clock moves the sky every frame, so the interval, not
 * the sky, bounds the bake rate; a held-back change is baked as soon as the interval allows.
 */
export const skyBakeSchedule = (
  threshold: number,
  minInterval: RealSeconds,
): ((sky: Sky, now: RealSeconds) => boolean) => {
  let baked: { sky: Sky; at: number } | undefined;
  return (sky, now) => {
    if (baked && (now - baked.at < minInterval || drawnSkyChange(baked.sky, sky) <= threshold)) {
      return false;
    }
    baked = { sky: structuredClone(sky), at: now };
    return true;
  };
};

const LIGHT_MAPS_CHUNK = '#include <lights_fragment_maps>';

/** The materials three lights from the scene's environment. */
const takesEnvironment = (material: Material): boolean =>
  'isMeshStandardMaterial' in material || 'isMeshLambertMaterial' in material || 'isMeshPhongMaterial' in material;

export interface SkyEnvironment {
  /** Bakes the open sky as it stands when it has moved past the threshold; true when it did. */
  refresh: (sky: Sky, now: RealTimestamp) => boolean;
  /** Gives a scene the reflection; the shared patches keep it out of diffuse light, and a skylight dims it per fragment. */
  light: (scene: Scene) => void;
  dispose: () => void;
}

/**
 * `openSky` must already show the sky when `refresh` is called. The first bake happens here, so the texture a scene
 * compiles against exists before shaders warm up, and later bakes reuse it so no material recompiles.
 */
export const createSkyEnvironment = (
  renderer: WebGLRenderer,
  openSky: Mesh,
  { faceSize, rebakeChange, rebakeRealSeconds, strength }: SkyEnvironmentTuning,
  patches: MaterialPatches,
): SkyEnvironment => {
  const scene = new Scene();
  scene.add(openSky);
  const faces = new WebGLCubeRenderTarget(faceSize, { type: HalfFloatType, generateMipmaps: false });
  const camera = new CubeCamera(0.1, 10, faces);
  const prefilter = new PMREMGenerator(renderer);
  const due = skyBakeSchedule(rebakeChange, realSeconds(rebakeRealSeconds));
  const bake = (target?: WebGLRenderTarget): WebGLRenderTarget => {
    camera.update(renderer, scene);
    return prefilter.fromCubemap(faces.texture, target);
  };
  const prefiltered = bake();
  const lit = new Set<Scene>();
  const patch = materialPatch({
    applies: takesEnvironment,
    compile: (shader) => {
      if (!shader.fragmentShader.includes(LIGHT_MAPS_CHUNK)) {
        throw new Error(
          `three renamed ${LIGHT_MAPS_CHUNK}; the sky reflection cannot keep the environment out of diffuse`,
        );
      }
      shader.fragmentShader = shader.fragmentShader.replace(
        LIGHT_MAPS_CHUNK,
        `${LIGHT_MAPS_CHUNK}\niblIrradiance = vec3( 0.0 );`,
      );
    },
    key: () => 'reflection-only',
  });
  patches.add(patch);
  return {
    refresh(sky, now) {
      if (!due(sky, realSeconds(now / 1000))) {
        return false;
      }
      bake(prefiltered);
      return true;
    },
    light(served) {
      lit.add(served);
      served.environment = prefiltered.texture;
      served.environmentIntensity = strength;
    },
    dispose() {
      for (const served of lit) {
        served.environment = null;
      }
      scene.remove(openSky);
      prefiltered.dispose();
      faces.dispose();
      prefilter.dispose();
    },
  };
};
