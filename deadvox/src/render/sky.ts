import { type Color, type DirectionalLight, Fog, type HemisphereLight, type Scene, SRGBColorSpace } from 'three';
import type { Rgb, Sky } from '../core/sky.ts';

export interface SkyTargets {
  scene: Scene;
  /** The sun by day, the moon by night. */
  light: DirectionalLight;
  ambient: HemisphereLight;
  /** View radius in metres; fog distances are fractions of it. */
  radiusM: number;
}

const set = (color: Color, [r, g, b]: Rgb): Color => color.setRGB(r, g, b, SRGBColorSpace);

/** Applies a sky (core/sky.ts) to the scene's background, fog and lights. */
export const applySky = ({ scene, light, ambient, radiusM }: SkyTargets, sky: Sky): void => {
  if (!(scene.fog instanceof Fog)) {
    scene.fog = new Fog(0);
  }
  const fog = scene.fog as Fog;
  set(fog.color, sky.sky);
  fog.near = radiusM * sky.fogNear;
  fog.far = radiusM * sky.fogFar;
  scene.background = fog.color;

  light.position.set(...sky.light);
  set(light.color, sky.lightColor);
  light.intensity = sky.lightIntensity;

  set(ambient.color, sky.ambientSky);
  set(ambient.groundColor, sky.ambientGround);
  ambient.intensity = sky.ambientIntensity;
};
