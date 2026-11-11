// The sky's reflection on models. Metal has nothing to reflect without an environment, so it draws near black; a
// prefiltered map of the dome gives it the sky. The map is baked from the dome alone, never the world, so it stands
// for open sky, and sky exposure dims it where the sky cannot reach (render/skylight.ts, `Skylight`), as it dims the
// hemisphere light, so metal does not glow indoors.
//
// A bake draws six faces and prefilters them, too much for every frame, so it is redone only once the drawn sky has
// moved past the day cycle's `environment.rebakeChange`. Measuring the change rather than baking at set hours keeps the
// reflection as close behind a fast twilight as behind a slow noon. Clouds bake as they stand; their drift between
// bakes is too slow to see in a blurred reflection.
//
// The environment reaches every lit material in the scenes it serves, but the hemisphere light already owns the
// diffuse sky light, so those materials take the reflection only (`reflectOnly`).

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

/** The parts of a sky the dome draws from; fog distance, bloom and tone change nothing in it. */
const DRAWN: readonly (keyof Sky)[] = [
  'sky',
  'sunDirection',
  'light',
  'lightColor',
  'lightIntensity',
  'ambientSky',
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

/** How far the drawn sky has moved between two skies: the largest change in any value the dome draws from. */
export const drawnSkyChange = (a: Sky, b: Sky): number =>
  Math.max(...DRAWN.map((key) => largestChange(a[key], b[key])));

/**
 * Decides when the reflection is stale, measured against the sky last baked so slow drift adds up to a bake. The
 * returned check is true when the sky has moved past the threshold, and then records it as baked.
 */
export const skyBakeSchedule = (threshold: number): ((sky: Sky) => boolean) => {
  let baked: Sky | undefined;
  return (sky) => {
    if (baked && drawnSkyChange(baked, sky) <= threshold) {
      return false;
    }
    baked = structuredClone(sky);
    return true;
  };
};

/** Keeps the environment out of a material's diffuse light. */
const reflectOnly = (material: Material): void => {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_maps>',
      '#include <lights_fragment_maps>\niblIrradiance = vec3( 0.0 );',
    );
  };
  material.customProgramCacheKey = () => `${key.call(material)}:reflection-only`;
  material.needsUpdate = true;
};

export interface SkyEnvironment {
  /** Bakes the open sky as it stands when it has moved past the threshold; true when it did. */
  refresh: (sky: Sky) => boolean;
  /**
   * Gives a scene the reflection at `exposure`, the sky exposure the scene does not apply per fragment itself, and
   * keeps every material it holds reflection-only; call it whenever materials may have joined, and before warm-up.
   */
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
  { faceSize, rebakeChange, strength }: SkyEnvironmentTuning,
): SkyEnvironment => {
  const scene = new Scene();
  scene.add(openSky);
  const faces = new WebGLCubeRenderTarget(faceSize, { type: HalfFloatType, generateMipmaps: false });
  const camera = new CubeCamera(0.1, 10, faces);
  const prefilter = new PMREMGenerator(renderer);
  const due = skyBakeSchedule(rebakeChange);
  const bake = (target?: WebGLRenderTarget): WebGLRenderTarget => {
    camera.update(renderer, scene);
    return prefilter.fromCubemap(faces.texture, target);
  };
  const prefiltered = bake();
  const lit = new Set<Scene>();
  const patched = new WeakSet<Material>();
  return {
    refresh(sky) {
      if (!due(sky)) {
        return false;
      }
      bake(prefiltered);
      return true;
    },
    light(served, exposure) {
      lit.add(served);
      served.environment = prefiltered.texture;
      served.environmentIntensity = strength * exposure;
      served.traverse((object) => {
        const { material } = object as Mesh;
        for (const entry of material ? [material].flat() : []) {
          if (!patched.has(entry)) {
            patched.add(entry);
            reflectOnly(entry);
          }
        }
      });
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
