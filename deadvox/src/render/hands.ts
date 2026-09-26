// What you hold, in first person (DESIGN.md, "Hands: what you see is what's there"):
// the right hand, the left hand, or both for a two-handed item. Held items are drawn
// after the world, in their own scene with the depth buffer cleared, so they never
// clip into walls. Their lights copy the sky's, so they're dark at night. An item
// without a model (or whose model hasn't loaded) is a plain box sized from its cells.

import {
  BoxGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  PerspectiveCamera,
  Scene,
  type WebGLRenderer,
} from 'three';
import type { Vec3 } from '../core/coords.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import type { ModelLibrary } from './models.ts';
import type { SkyTargets } from './sky.ts';

/** Where a held item's grip sits, in metres from the eye (x right, y up, −z forward). */
export const HOLD: Readonly<Record<HandSide | 'both', Vec3>> = {
  right: [0.2, -0.2, -0.38],
  left: [-0.2, -0.2, -0.38],
  both: [0.08, -0.22, -0.42],
};

/** Metres per grid cell for the stand-in box. */
const CELL = 0.06;

export class HeldItems {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(75, 1, 0.01, 10);
  /** Turned like the main camera each frame, so the sky's light directions carry over as they are. */
  private readonly view = new Group();
  private readonly light = new DirectionalLight();
  private readonly ambient = new HemisphereLight();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshLambertMaterial({ color: 0x6b_66_60 });
  private readonly inventory: Inventory;
  private readonly models: ModelLibrary | undefined;
  private drawn = '';

  constructor(inventory: Inventory, models?: ModelLibrary) {
    this.inventory = inventory;
    this.models = models;
    this.scene.add(this.view, this.light, this.ambient);
  }

  /** Draws what's in your hands over the frame the main camera just rendered. */
  render(renderer: WebGLRenderer, main: PerspectiveCamera, sky: SkyTargets): void {
    this.sync();
    if (this.view.children.length === 0) {
      return;
    }
    this.light.position.copy(sky.light.position);
    this.light.color.copy(sky.light.color);
    this.light.intensity = sky.light.intensity;
    this.ambient.color.copy(sky.ambient.color);
    this.ambient.groundColor.copy(sky.ambient.groundColor);
    this.ambient.intensity = sky.ambient.intensity;
    if (this.camera.fov !== main.fov || this.camera.aspect !== main.aspect) {
      this.camera.fov = main.fov;
      this.camera.aspect = main.aspect;
      this.camera.updateProjectionMatrix();
    }
    this.camera.quaternion.copy(main.quaternion);
    this.view.quaternion.copy(main.quaternion);
    const { autoClear } = renderer;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  /** Rebuilds what's held when the hands changed or a model loaded. */
  private sync(): void {
    const version = `${this.inventory.version}:${this.models?.version ?? 0}`;
    if (version === this.drawn) {
      return;
    }
    this.drawn = version;
    this.view.clear();
    const { hands, registry } = this.inventory;
    for (const side of ['right', 'left'] as const) {
      const item = hands[side];
      if (item) {
        const held = this.shape(item);
        held.position.set(...HOLD[defOf(registry, item.type).twoHanded ? 'both' : side]);
        this.view.add(held);
      }
    }
  }

  private shape(item: Item): Object3D {
    const def = defOf(this.inventory.registry, item.type);
    const model = def.model === undefined ? undefined : this.models?.held(def.model);
    if (model) {
      return model;
    }
    // Long side forward, short side across, and flatter than it is wide.
    const long = Math.max(...def.size) * CELL;
    const short = Math.min(...def.size) * CELL;
    const box = new Mesh(this.geometry, this.material);
    box.scale.set(short, short * 0.6, long);
    box.position.z = -long / 2 + short / 2; // the hand holds its near end
    return new Group().add(box);
  }
}
