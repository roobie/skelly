// The sky's reflection on models; the why is in `packages/deadvox/GRAPHICS.md`, "Look decisions".

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
import { MaterialPatches, materialPatch } from './materialPatches.ts';

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
 * Where the sun and the light that follows its arc point. Below the horizon the sun draws nothing on the dome: its disc
 * and glow are hidden by the ground fog, the physical sky is off and the sun's own brightness is out of the looks. What
 * remains, the moon and the clouds' lit side, is too dim and too small for the blurred reflection to show it move.
 */
const SUN_BORNE: readonly (keyof Sky)[] = ['sunDirection', 'light'];

const sunUp = (sky: Sky): boolean => sky.sunDirection[1] > 0;

/** How far the drawn sky has moved between two skies: the largest change in any value the dome draws from. */
const drawnSkyChange = (a: Sky, b: Sky): number =>
  Math.max(
    ...DRAWN.map((key) => largestChange(a[key], b[key])),
    ...(sunUp(a) || sunUp(b) ? SUN_BORNE.map((key) => largestChange(a[key], b[key])) : []),
  );

/**
 * Decides when the reflection is stale, measured against the sky last baked so slow drift adds up to a bake. The
 * returned check is true when the sky has moved past the threshold and `minInterval` real seconds have passed since
 * the last bake, and then records it as baked. A fast-forwarded clock moves the sky every frame, so the interval, not
 * the sky, bounds the bake rate; a held-back change is baked as soon as the interval allows.
 */
export const skyBakeSchedule = (threshold: number, minInterval: number): ((sky: Sky, now: number) => boolean) => {
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
  /** Bakes the open sky as it stands when it has moved past the threshold; true when it did. `now` is real seconds. */
  refresh: (sky: Sky, now: number) => boolean;
  /** Keeps the environment out of the diffuse light of a scene's materials now, for a scene the shared patches do not walk. */
  patchNow: (scene: Scene) => void;
  /** Gives a scene the reflection at `exposure`, the sky exposure the scene does not apply per fragment itself. */
  light: (scene: Scene, exposure: number) => void;
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
  const due = skyBakeSchedule(rebakeChange, rebakeRealSeconds);
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
  const own = new MaterialPatches();
  own.add(patch);
  return {
    patchNow: (served) => own.apply(served),
    refresh(sky, now) {
      if (!due(sky, now)) {
        return false;
      }
      bake(prefiltered);
      return true;
    },
    light(served, exposure) {
      lit.add(served);
      served.environment = prefiltered.texture;
      served.environmentIntensity = strength * exposure;
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
