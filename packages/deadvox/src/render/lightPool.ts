import { Group, type PerspectiveCamera, PointLight, type Scene, Vector3 } from 'three';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { Inventory, Location } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { lightExposureFor } from '../core/lights.ts';
import type { PoweredLight } from '../core/sitePower.ts';
import type { HeldItems } from './hands.ts';
import type { PileMeshes } from './piles.ts';

/** Fixed shader-light budget: carried sources and dropped sources have stable partitions. */
const CARRIED_POINT_LIGHTS = 4;
const DROPPED_POINT_LIGHTS = 4;
const FIXTURE_POINT_LIGHTS = 4;
const ITEM_POINT_LIGHTS = CARRIED_POINT_LIGHTS + DROPPED_POINT_LIGHTS;
export const POINT_LIGHT_POOL_SIZE = ITEM_POINT_LIGHTS + FIXTURE_POINT_LIGHTS;
/** Fixed shader budget for the night-vision flare's halos at once (`src/render/nightVisionFlare.ts`). */
export const NIGHT_VISION_HALOS = 4;

interface LightPoolContext {
  held: Pick<HeldItems, 'lightPositionOf'>;
  /** A light set down shines from its drawn flame; one drawn without a flame shines from over its cell. */
  piles?: Pick<PileMeshes, 'lightPositionOf'>;
  camera: PerspectiveCamera;
  blockSize: number;
  daylightScale: number;
  fixtures?: readonly PoweredLight[];
}

function handPriority(location: Location): number {
  if (location.kind !== 'hand') {
    return 2;
  }
  return location.side === 'right' ? 0 : 1;
}

function sourcePosition(
  { item, location }: { item: Item; location: Location },
  { held, piles, camera, blockSize }: LightPoolContext,
  groundLiftMetres: number,
  out: Vector3,
): void {
  if (location.kind === 'hand') {
    if (!held.lightPositionOf(item, out)) {
      out.copy(camera.position);
    }
  } else if (location.kind === 'pile') {
    if (!piles?.lightPositionOf(item, out)) {
      const [x, y, z] = location.pile.pos;
      out.set((x + 0.5) * blockSize, y * blockSize + groundLiftMetres, (z + 0.5) * blockSize);
    }
  } else {
    out.copy(camera.position);
  }
}

export class LightPool {
  readonly group = new Group();
  readonly lights: readonly PointLight[];
  /** Per slot: the goggles' own lamp, which they see by rather than look into, so it never flares them. */
  readonly flareSkipped: boolean[] = Array.from({ length: POINT_LIGHT_POOL_SIZE }, () => false);
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

  update(inventory: Inventory, context: LightPoolContext): void {
    const { camera, blockSize, daylightScale } = context;
    const groundLiftMetres = inventory.registry.senses.get(CORE_CONTENT_IDS.player)!.light.groundLight.renderLiftMetres;
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

    const fixtures = [...(context.fixtures ?? [])]
      .sort((a, b) => {
        const distance = ({ pos }: PoweredLight) =>
          (pos[0] * blockSize - camera.position.x) ** 2 +
          (pos[1] * blockSize - camera.position.y) ** 2 +
          (pos[2] * blockSize - camera.position.z) ** 2;
        return distance(a) - distance(b);
      })
      .slice(0, FIXTURE_POINT_LIGHTS);
    for (const [index, light] of this.lights.entries()) {
      if (index >= ITEM_POINT_LIGHTS) {
        const fixture = fixtures[index - ITEM_POINT_LIGHTS];
        light.intensity = fixture ? fixture.intensity * daylightScale : 0;
        this.flareSkipped[index] = false;
        if (fixture) {
          light.position.set(...(fixture.pos.map((value) => value * blockSize) as [number, number, number]));
          light.color.set(fixture.color);
          light.distance = fixture.radius;
        }
        this.syncHandLight(index, light);
        continue;
      }
      const entry = index < CARRIED_POINT_LIGHTS ? carried[index] : dropped[index - CARRIED_POINT_LIGHTS];
      if (!entry) {
        light.intensity = 0;
        this.syncHandLight(index, light);
        continue;
      }
      const spec = inventory.registry.items.get(entry.item.type)!.light!;
      const position = this.positions[index]!;
      sourcePosition(entry, context, groundLiftMetres, position);
      light.position.copy(position);
      light.color.set(spec.color);
      light.distance = spec.radius;
      light.intensity = spec.intensity * daylightScale;
      this.flareSkipped[index] = spec.nightVision !== undefined;
      this.syncHandLight(index, light);
    }
  }
}
