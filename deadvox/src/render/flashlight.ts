// The beam of the light in your hands: a three.js spot light at the held model's lens,
// pointing where you look (SLICE-1.md, "Dark interiors": moving lights stay three.js
// lights when voxel light arrives). It stays in the scene with no intensity while
// off, so switching it doesn't recompile every material.

import { MathUtils, type PerspectiveCamera, type Scene, SpotLight, Vector3 } from 'three';
import type { Registry } from '../core/content.ts';
import { defOf, type Item } from '../core/items.ts';
import type { Sky } from '../core/sky.ts';
import type { HeldItems } from './hands.ts';

/** Candela; with a decay of 1.5 this lights a wall 10 m away well at night. */
const INTENSITY = 40;
const DECAY = 1.5;
const PENUMBRA = 0.35;

/** Sun plus ambient intensity at which the beam is at half strength. */
const HALF_BRIGHTNESS = 0.9;
/** How sharply the beam fades around `HALF_BRIGHTNESS`; high enough that night stays ~1 and noon is negligible. */
const FADE_SHARPNESS = 5;

/**
 * The share of the beam's strength to keep, in (0, 1]: about 1 by night, a few percent of
 * the sun's contribution at noon, partial at dusk and dawn. It approximates eye adaptation:
 * a flashlight pool vanishes in daylight although its output is the same. It keys off the
 * outdoor sky light (sun/moon plus ambient intensity, so overcast or moonlit variants follow),
 * so a dark interior at noon dims the flashlight too until voxel skylight exists; then
 * it should key off the local light instead.
 */
export const flashlightDaylightScale = (sky: Pick<Sky, 'lightIntensity' | 'ambientIntensity'>): number => {
  const brightness = sky.lightIntensity + sky.ambientIntensity;
  return 1 / (1 + (brightness / HALF_BRIGHTNESS) ** FADE_SHARPNESS);
};

export class Flashlight {
  private readonly light = new SpotLight(0xff_f1_d8, 0, 20, Math.PI / 12, PENUMBRA, DECAY);
  private readonly at = new Vector3();
  private readonly ahead = new Vector3();

  constructor(scene: Scene) {
    scene.add(this.light, this.light.target);
  }

  /** `flashlightDaylightScale` of the sky being drawn; set it each frame before `update`. */
  daylightScale = 1;

  /** Points the beam of the light that's on, or turns it off. Call after `held.update`. */
  update(registry: Registry, lit: Item | undefined, held: HeldItems, camera: PerspectiveCamera): void {
    const def = lit && defOf(registry, lit.type).light;
    if (!(lit?.on && def && held.lensOf(lit, camera, this.at))) {
      this.light.intensity = 0;
      return;
    }
    this.light.intensity = INTENSITY * this.daylightScale;
    this.light.distance = def.radius;
    this.light.angle = MathUtils.degToRad((def.beam ?? 120) / 2);
    this.light.position.copy(this.at);
    camera.getWorldDirection(this.ahead);
    this.light.target.position.copy(this.at).addScaledVector(this.ahead, 10);
    this.light.target.updateMatrixWorld();
  }
}
