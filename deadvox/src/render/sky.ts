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

export interface SkyTargets {
  scene: Scene;
  /** The sun by day, the moon by night. */
  light: DirectionalLight;
  ambient: HemisphereLight;
  /** Its far plane follows the fog. */
  camera: PerspectiveCamera;
  /** View radius in metres; fog distances are fractions of it. */
  radiusM: number;
}

const set = (color: Color, [r, g, b]: Rgb): Color => color.setRGB(r, g, b, SRGBColorSpace);

/**
 * Applies a sky (core/sky.ts) to the scene's background, fog and lights, and moves the
 * camera's far plane to where the fog ends.
 */
export const applySky = ({ scene, light, ambient, camera, radiusM }: SkyTargets, sky: Sky): void => {
  if (!(scene.fog instanceof Fog)) {
    scene.fog = new Fog(0);
  }
  const fog = scene.fog as Fog;
  set(fog.color, sky.sky);
  fog.near = radiusM * sky.fogNear;
  fog.far = radiusM * sky.fogFar;
  scene.background = fog.color;
  // Fog and the far plane both go by depth along the view, and at fog.far a surface is
  // exactly the background colour. So nothing beyond it can show: clipping there
  // changes no pixel, and frustum culling skips those chunks (most of them at night).
  if (camera.far !== fog.far) {
    camera.far = fog.far;
    camera.updateProjectionMatrix();
  }

  light.position.set(...sky.light);
  set(light.color, sky.lightColor);
  light.intensity = sky.lightIntensity;

  set(ambient.color, sky.ambientSky);
  set(ambient.groundColor, sky.ambientGround);
  ambient.intensity = sky.ambientIntensity;
};
