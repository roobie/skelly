import { Group, type PerspectiveCamera, PointLight, type Scene, Vector3 } from 'three';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { Inventory, Location } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { lightExposureFor } from '../core/lights.ts';
import type { PoweredLight } from '../core/sitePower.ts';
import type { HeldItems } from './hands.ts';
import type { DrawnAnchors } from './mobActors.ts';
import type { PileMeshes } from './piles.ts';

/** Fixed shader-light budget: carried sources and dropped sources have stable partitions. */
const CARRIED_POINT_LIGHTS = 4;
const DROPPED_POINT_LIGHTS = 4;
/** Point-light slots before the fixtures. */
export const ITEM_POINT_LIGHTS = CARRIED_POINT_LIGHTS + DROPPED_POINT_LIGHTS;
/** Fixed shader budget for the night-vision flare's halos at once (`src/render/nightVisionFlare.ts`). */
export const NIGHT_VISION_HALOS = 4;

interface LightPoolContext {
  held: Pick<HeldItems, 'lightPositionOf'>;
  /** A light set down shines from its drawn flame; one drawn without a flame shines from over its cell. */
  piles?: Pick<PileMeshes, 'lightPositionOf'>;
  camera: PerspectiveCamera;
  blockSize: number;
  daylightScale: number;
  /**
   * World output must not inherit the viewer's daylight washout through a bright doorway.
   * The separate hand scene still adapts to the viewer through `daylightScale`.
   */
  worldDaylightScale?: number;
  fixtures?: readonly PoweredLight[];
  /** Body glows (the acid sac): presentation lights that take the item slots no item uses, nearest first. */
  glows?: readonly BodyGlow[];
}

export interface BodyGlow {
  /** Metres. */
  readonly position: readonly [number, number, number];
  readonly color: string;
  readonly intensity: number;
  readonly radiusMetres: number;
}

/** The acid sacs' glows as drawn this frame. */
export function acidGlows(anchors: Iterable<DrawnAnchors>): BodyGlow[] {
  const glows: BodyGlow[] = [];
  for (const { zombie, glow } of anchors) {
    const body = zombie.type.acidBody;
    if (body && glow) {
      glows.push({ position: glow, color: body.color, ...body.light });
    }
  }
  return glows;
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
  readonly flareSkipped: boolean[];
  /** Shader point-light slots: the item partitions plus the content's fixture limit. */
  readonly size: number;
  private readonly fixtureLimit: number;
  private readonly handLights: readonly PointLight[];
  private readonly positions: readonly Vector3[];

  constructor(scene: Scene, fixtureLimit: number, handScene?: Scene) {
    this.fixtureLimit = fixtureLimit;
    this.size = ITEM_POINT_LIGHTS + fixtureLimit;
    this.flareSkipped = Array.from({ length: this.size }, () => false);
    this.positions = Array.from({ length: this.size }, () => new Vector3());
    this.lights = Array.from({ length: this.size }, () => {
      const light = new PointLight(0xff_ff_ff, 0, 0);
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

  private syncHandLight(index: number, source: PointLight, intensity = source.intensity): void {
    const handLight = this.handLights[index];
    if (!handLight) {
      return;
    }
    handLight.position.copy(source.position);
    handLight.color.copy(source.color);
    handLight.distance = source.distance;
    handLight.intensity = intensity;
    handLight.decay = source.decay;
  }

  private updateFixtureSlot(index: number, fixture: PoweredLight | undefined, context: LightPoolContext): void {
    const light = this.lights[index]!;
    const { blockSize, daylightScale } = context;
    this.flareSkipped[index] = false;
    if (!fixture) {
      light.intensity = 0;
      this.syncHandLight(index, light);
      return;
    }
    light.intensity = fixture.intensity * (context.worldDaylightScale ?? daylightScale);
    light.position.set(...(fixture.pos.map((value) => value * blockSize) as [number, number, number]));
    light.color.set(fixture.color);
    light.distance = fixture.radius;
    this.syncHandLight(index, light, fixture.intensity * daylightScale);
  }

  update(inventory: Inventory, context: LightPoolContext): void {
    const { camera, blockSize, daylightScale } = context;
    const tuning = inventory.registry.senses.get(CORE_CONTENT_IDS.player)!.light;
    const groundLiftMetres = tuning.groundLight.renderLiftMetres;
    const { pointDecay } = tuning.illumination;
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
      .slice(0, this.fixtureLimit);
    const glowDistance = ({ position }: BodyGlow) =>
      (position[0] - camera.position.x) ** 2 +
      (position[1] - camera.position.y) ** 2 +
      (position[2] - camera.position.z) ** 2;
    const glows = [...(context.glows ?? [])].sort((a, b) => glowDistance(a) - glowDistance(b));
    for (const [index, light] of this.lights.entries()) {
      light.decay = pointDecay;
      if (index >= ITEM_POINT_LIGHTS) {
        this.updateFixtureSlot(index, fixtures[index - ITEM_POINT_LIGHTS], context);
        continue;
      }
      const entry = index < CARRIED_POINT_LIGHTS ? carried[index] : dropped[index - CARRIED_POINT_LIGHTS];
      if (!entry) {
        const glow = glows.shift();
        this.flareSkipped[index] = false;
        if (glow) {
          light.position.set(...glow.position);
          light.color.set(glow.color);
          light.distance = glow.radiusMetres;
          light.intensity = glow.intensity * daylightScale;
        } else {
          light.intensity = 0;
        }
        this.syncHandLight(index, light);
        continue;
      }
      const spec = inventory.registry.items.get(entry.item.type)!.light!;
      const position = this.positions[index]!;
      sourcePosition(entry, context, groundLiftMetres, position);
      light.position.copy(position);
      light.color.set(spec.color);
      light.distance = spec.radius;
      light.intensity = spec.intensity * (context.worldDaylightScale ?? daylightScale);
      this.flareSkipped[index] = spec.nightVision !== undefined;
      this.syncHandLight(index, light, spec.intensity * daylightScale);
    }
  }
}
