import { Group, type PerspectiveCamera, PointLight, type Scene, Vector3 } from 'three';
import type { Inventory, Location } from '../core/inventory.ts';
import { lightExposureFor, WORLD_LIGHT_HEIGHT_METRES } from '../core/lights.ts';
import type { HeldItems } from './hands.ts';

/** Fixed shader-light budget: carried sources and dropped sources have stable partitions. */
const CARRIED_POINT_LIGHTS = 4;
const DROPPED_POINT_LIGHTS = 4;
export const POINT_LIGHT_POOL_SIZE = CARRIED_POINT_LIGHTS + DROPPED_POINT_LIGHTS;

interface LightPoolContext {
  held: Pick<HeldItems, 'lightPositionOf'>;
  camera: PerspectiveCamera;
  blockSize: number;
  daylightScale: number;
}

function handPriority(location: Location): number {
  if (location.kind !== 'hand') {
    return 2;
  }
  return location.side === 'right' ? 0 : 1;
}

export class LightPool {
  readonly group = new Group();
  readonly lights: readonly PointLight[];
  private readonly handLights: readonly PointLight[];
  private readonly positions = Array.from({ length: POINT_LIGHT_POOL_SIZE }, () => new Vector3());

  constructor(scene: Scene, handScene?: Scene) {
    this.lights = Array.from({ length: POINT_LIGHT_POOL_SIZE }, () => {
      const light = new PointLight(0xff_ff_ff, 0, 0, 1);
      light.castShadow = false;
      this.group.add(light);
      return light;
    });
    this.handLights = handScene
      ? this.lights.map((light) => {
          const handLight = light.clone();
          handLight.castShadow = false;
          handScene.add(handLight);
          return handLight;
        })
      : [];
    scene.add(this.group);
  }

  private syncHandLight(index: number, source: PointLight): void {
    const handLight = this.handLights[index];
    if (!handLight) {
      return;
    }
    handLight.position.copy(source.position);
    handLight.color.copy(source.color);
    handLight.distance = source.distance;
    handLight.intensity = source.intensity;
    handLight.decay = source.decay;
  }

  update(inventory: Inventory, { held, camera, blockSize, daylightScale }: LightPoolContext): void {
    const entries = [...inventory.items()]
      .map((entry, order) => ({
        ...entry,
        order,
        exposure: lightExposureFor(inventory.registry, entry.item, entry.location, entry.path),
      }))
      .filter(
        ({ item, exposure }) =>
          exposure !== undefined && inventory.registry.items.get(item.type)?.light?.beam === undefined,
      );
    const carried = entries
      .filter(({ exposure }) => exposure === 'carried')
      .sort((a, b) => handPriority(a.location) - handPriority(b.location) || a.order - b.order)
      .slice(0, CARRIED_POINT_LIGHTS);
    const dropped = entries
      .filter(({ exposure }) => exposure === 'world')
      .sort((a, b) => {
        const [ax, ay, az] = a.location.kind === 'pile' ? a.location.pile.pos : [0, 0, 0];
        const [bx, by, bz] = b.location.kind === 'pile' ? b.location.pile.pos : [0, 0, 0];
        const distanceA =
          (ax - camera.position.x / blockSize) ** 2 +
          (ay - camera.position.y / blockSize) ** 2 +
          (az - camera.position.z / blockSize) ** 2;
        const distanceB =
          (bx - camera.position.x / blockSize) ** 2 +
          (by - camera.position.y / blockSize) ** 2 +
          (bz - camera.position.z / blockSize) ** 2;
        return distanceA - distanceB || a.order - b.order;
      })
      .slice(0, DROPPED_POINT_LIGHTS);

    for (const [index, light] of this.lights.entries()) {
      const entry = index < CARRIED_POINT_LIGHTS ? carried[index] : dropped[index - CARRIED_POINT_LIGHTS];
      if (!entry) {
        light.intensity = 0;
        this.syncHandLight(index, light);
        continue;
      }
      const spec = inventory.registry.items.get(entry.item.type)!.light!;
      const position = this.positions[index]!;
      if (entry.location.kind === 'hand') {
        if (!held.lightPositionOf(entry.item, position)) {
          position.copy(camera.position);
        }
      } else if (entry.location.kind === 'pile') {
        const [x, y, z] = entry.location.pile.pos;
        position.set((x + 0.5) * blockSize, y * blockSize + WORLD_LIGHT_HEIGHT_METRES, (z + 0.5) * blockSize);
      } else {
        position.copy(camera.position);
      }
      light.position.copy(position);
      light.color.set(spec.color);
      light.distance = spec.radius;
      light.intensity = spec.intensity * daylightScale;
      this.syncHandLight(index, light);
    }
  }
}
