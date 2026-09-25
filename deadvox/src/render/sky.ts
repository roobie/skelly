import type { Color, DirectionalLight, Fog, HemisphereLight, Scene } from 'three';
import type { Sky } from '../core/sim/sky.ts';

export interface SkyLights {
  sun: DirectionalLight;
  ambient: HemisphereLight;
}

/** Sets background, fog and light from a sky. The scene must have a Color background and a Fog. */
export const applySky = (scene: Scene, lights: SkyLights, sky: Sky): void => {
  (scene.background as Color).setHex(sky.color);
  (scene.fog as Fog).color.setHex(sky.color);
  lights.sun.position.set(...sky.sunDir);
  lights.sun.intensity = sky.sun;
  lights.ambient.intensity = sky.ambient;
};
