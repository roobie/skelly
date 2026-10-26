import {
  type Color,
  type DirectionalLight,
  Fog,
  type HemisphereLight,
  type PerspectiveCamera,
  type Scene,
  SRGBColorSpace,
} from 'three';
import type { Rgb, Sky } from '../core/sky.ts';
import { installDistanceFog } from './distanceFog.ts';

export interface SkyTargets {
  scene: Scene;
  /** The sun by day, the moon by night. */
  light: DirectionalLight;
  ambient: HemisphereLight;
  /** Its far plane follows the fog. */
  camera: PerspectiveCamera;
  /** View radius in metres; fog distances are fractions of it. */
  radiusM: number;
  /** The far plane as a multiple of where the fog ends (render/distanceFog.ts). */
  farPlaneScale: number;
}

const set = (color: Color, [r, g, b]: Rgb): Color => color.setRGB(r, g, b, SRGBColorSpace);

/**
 * Applies a sky (core/sky.ts) to the scene's background, fog and lights, and moves the
 * camera's far plane with where the fog ends.
 */
export const applySky = (
  { scene, light, ambient, camera, radiusM, farPlaneScale }: SkyTargets,
  sky: Sky,
  skyVisibility = 1,
): void => {
  installDistanceFog(farPlaneScale);
  if (!(scene.fog instanceof Fog)) {
    scene.fog = new Fog(0);
  }
  const fog = scene.fog as Fog;
  set(fog.color, sky.sky).multiplyScalar(skyVisibility);
  fog.near = radiusM * sky.fogNear;
  fog.far = radiusM * sky.fogFar;
  scene.background = fog.color;
  // At the far plane a surface is already exactly the background colour (render/distanceFog.ts),
  // so clipping there changes no pixel, and frustum culling skips those chunks (most at night).
  const far = fog.far * farPlaneScale;
  if (camera.far !== far) {
    camera.far = far;
    camera.updateProjectionMatrix();
  }

  light.position.set(...sky.light);
  set(light.color, sky.lightColor);
  light.intensity = sky.lightIntensity;

  set(ambient.color, sky.ambientSky);
  set(ambient.groundColor, sky.ambientGround);
  ambient.intensity = sky.ambientIntensity;
};
