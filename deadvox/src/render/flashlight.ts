// The beam of the light in your hands: a three.js spot light at the held model's lens,
// pointing where you look (SLICE-1.md, "Dark interiors": moving lights stay three.js
// lights when voxel light arrives). It stays in the scene with no intensity while
// off, so switching it doesn't recompile every material.

import { MathUtils, type PerspectiveCamera, type Scene, SpotLight, Vector3 } from 'three';
import type { Registry } from '../core/content.ts';
import { defOf, type Item } from '../core/items.ts';
import type { HeldItems } from './hands.ts';

/** Candela; with a decay of 1.5 this lights a wall 10 m away well at night. */
const INTENSITY = 40;
const DECAY = 1.5;
const PENUMBRA = 0.35;

export class Flashlight {
  private readonly light = new SpotLight(0xff_f1_d8, 0, 20, Math.PI / 12, PENUMBRA, DECAY);
  private readonly at = new Vector3();
  private readonly ahead = new Vector3();

  constructor(scene: Scene) {
    scene.add(this.light, this.light.target);
  }

  /** Points the beam of the light that's on, or turns it off. Call after `held.update`. */
  update(registry: Registry, lit: Item | undefined, held: HeldItems, camera: PerspectiveCamera): void {
    const def = lit && defOf(registry, lit.type).light;
    if (!(lit?.on && def && held.lensOf(lit, camera, this.at))) {
      this.light.intensity = 0;
      return;
    }
    this.light.intensity = INTENSITY;
    this.light.distance = def.radius;
    this.light.angle = MathUtils.degToRad((def.beam ?? 120) / 2);
    this.light.position.copy(this.at);
    camera.getWorldDirection(this.ahead);
    this.light.target.position.copy(this.at).addScaledVector(this.ahead, 10);
    this.light.target.updateMatrixWorld();
  }
}
