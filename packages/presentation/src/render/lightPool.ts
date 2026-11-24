import {
  claimed,
  type Inventory,
  type Item,
  type Location,
  lightExposureFor,
  placedLightEntries,
} from '@skelly/engine/inventory';
import type { PoweredLight } from '@skelly/engine/world';
import { Frustum, Group, Matrix4, type PerspectiveCamera, PointLight, type Scene, Sphere, Vector3 } from 'three';
import type { HeldItems } from './hands.ts';
import type { DrawnAnchors } from './mobActors.ts';
import type { PileMeshes } from './piles.ts';

/**
 * The pool's size, from content: carried and dropped item lamps have stable partitions, then come the fixtures.
 * Every item slot casts a cube shadow and costs each frame, so the sizes are a budget. They size the pool itself, not
 * only the shadow flags, because the renderer orders shadow-casting lights first and the reach and sky-fade patches
 * address a light by that shader order.
 */
export interface LightPoolSizes {
  readonly heldLamps: number;
  readonly droppedLamps: number;
  readonly renderedFixtureLimit: number;
}

/** Point-light slots before the fixtures. */
export const itemLightSlots = ({ heldLamps, droppedLamps }: Pick<LightPoolSizes, 'heldLamps' | 'droppedLamps'>) =>
  heldLamps + droppedLamps;
/** Fixed shader budget for the night-vision flare's halos at once (`src/render/nightVisionFlare.ts`). */
export const NIGHT_VISION_HALOS = 4;

interface LightPoolContext {
  held: Pick<HeldItems, 'lightPositionOf'>;
  /** A light set down shines from its drawn flame; one drawn without a flame shines from over its cell. */
  piles?: Pick<PileMeshes, 'lightPositionOf' | 'drawnModel'>;
  camera: PerspectiveCamera;
  blockSize: number;
  daylightScale: number;
  /**
   * World output must not inherit the viewer's daylight washout through a bright doorway.
   * The hand scene's lights copy the world's, so a carried lamp matches the world it is in.
   */
  worldDaylightScale?: number;
  fixtures?: readonly PoweredLight[];
  /** Body glows (the acid sac): presentation lights that take the item slots no item uses, nearest first. */
  glows?: readonly BodyGlow[];
  meetsView?: (light: PoweredLight) => boolean;
}

export interface BodyGlow {
  /** Metres. */
  readonly position: readonly [number, number, number];
  readonly color: string;
  readonly intensity: number;
  readonly radiusMetres: number;
}

/** What a light in the world shines with: it follows the world's daylight scale, not the camera's adaptation. */
function worldIntensity(base: number, { worldDaylightScale, daylightScale }: LightPoolContext, visible = true): number {
  return base * (worldDaylightScale ?? daylightScale) * Number(visible);
}

/** The acid sacs' glows as drawn this frame. */
export function acidGlows(anchors: Iterable<DrawnAnchors>): BodyGlow[] {
  const glows: BodyGlow[] = [];
  for (const { actor, glow } of anchors) {
    const body = actor.type.acidBody;
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
  private readonly glowFrustum = new Frustum();
  private readonly glowViewMatrix = new Matrix4();
  private readonly glowSphere = new Sphere();
  readonly group = new Group();
  readonly lights: readonly PointLight[];
  /** Per slot: the goggles' own lamp, which they see by rather than look into, so it never flares them. */
  readonly flareSkipped: boolean[];
  /** Shader point-light slots: the item partitions plus the content's fixture limit. */
  readonly size: number;
  /** Fixture sources in shader-slot order; item slots stay empty because their lamps cast cube shadows. */
  readonly reachSlots: (PoweredLight | undefined)[];
  readonly shadowBodies: ({ visible: boolean } | undefined)[];
  readonly itemVisible: boolean[];
  /** Item slots, which come before the fixtures in shader order. */
  readonly itemSlots: number;
  private readonly heldSlots: number;
  private readonly fixtureLimit: number;
  private readonly handLights: readonly PointLight[];
  private readonly positions: readonly Vector3[];

  constructor(scene: Scene, sizes: LightPoolSizes, handScene?: Scene) {
    this.fixtureLimit = sizes.renderedFixtureLimit;
    this.heldSlots = sizes.heldLamps;
    this.itemSlots = itemLightSlots(sizes);
    this.size = this.itemSlots + this.fixtureLimit;
    this.reachSlots = Array.from({ length: this.size }, () => undefined);
    this.shadowBodies = Array.from({ length: this.itemSlots }, () => undefined);
    this.itemVisible = Array.from({ length: this.itemSlots }, () => true);
    this.flareSkipped = Array.from({ length: this.size }, () => false);
    this.positions = Array.from({ length: this.size }, () => new Vector3());
    this.lights = Array.from({ length: this.size }, (_, index) => {
      const light = new PointLight(0xff_ff_ff, 0, 0);
      light.castShadow = false;
      light.userData.carried = index < this.heldSlots;
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

  shareItemShadows(): void {
    this.lights.slice(0, this.itemSlots).forEach((light, slot) => {
      const hand = this.handLights[slot];
      if (hand) {
        hand.castShadow = light.castShadow;
        hand.shadow = light.shadow;
      }
    });
  }

  dispose(): void {
    for (const light of this.lights) {
      light.shadow.dispose();
    }
  }

  private static bodyOf(entry: { item: Item; location: Location } | undefined, context: LightPoolContext) {
    return entry?.location.kind === 'pile' ? context.piles?.drawnModel(entry.item.uid) : undefined;
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

  private updateFixtureSlot(index: number, fixture: PoweredLight | undefined, context: LightPoolContext): void {
    const light = this.lights[index]!;
    const { blockSize } = context;
    this.flareSkipped[index] = false;
    if (!fixture) {
      light.intensity = 0;
      this.syncHandLight(index, light);
      return;
    }
    light.intensity = worldIntensity(fixture.intensity, context);
    light.position.set(...(fixture.pos.map((value) => value * blockSize) as [number, number, number]));
    light.color.set(fixture.color);
    light.distance = fixture.radius;
    this.syncHandLight(index, light);
  }

  update(inventory: Inventory, context: LightPoolContext): void {
    const { camera, blockSize } = context;
    this.glowFrustum.setFromProjectionMatrix(
      this.glowViewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const tuning = claimed(inventory.registry.senses, 'player')!.light;
    const groundLiftMetres = tuning.groundLight.renderLiftMetres;
    const { pointDecay } = tuning.illumination;
    const entries = placedLightEntries(inventory)
      .map((entry, order) => ({
        ...entry,
        order,
        exposure: lightExposureFor(inventory.registry, entry.item, entry.location, entry.path),
      }))
      .filter(
        ({ item, exposure }) =>
          exposure !== undefined && inventory.registry.items.get(item.type)?.light?.beam === undefined,
      )
      .map((entry) => {
        const spec = inventory.registry.items.get(entry.item.type)!.light!;
        const position = new Vector3();
        sourcePosition(entry, context, groundLiftMetres, position);
        const meetsView =
          context.meetsView?.({
            pos: [position.x / blockSize, position.y / blockSize, position.z / blockSize],
            radius: spec.radius,
            color: spec.color,
            intensity: spec.intensity,
            reachSource: entry.item,
          }) ?? true;
        return { ...entry, meetsView };
      });
    const carried = entries
      .filter(({ exposure }) => exposure === 'carried')
      .sort(
        (a, b) =>
          Number(b.meetsView) - Number(a.meetsView) ||
          handPriority(a.location) - handPriority(b.location) ||
          a.order - b.order,
      )
      .slice(0, this.heldSlots);
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
        return Number(b.meetsView) - Number(a.meetsView) || distanceA - distanceB || a.order - b.order;
      })
      .slice(0, this.itemSlots - this.heldSlots);

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
      if (index >= this.itemSlots) {
        this.updateFixtureSlot(index, fixtures[index - this.itemSlots], context);
        continue;
      }
      const entry = index < this.heldSlots ? carried[index] : dropped[index - this.heldSlots];
      this.shadowBodies[index] = LightPool.bodyOf(entry, context);
      this.itemVisible[index] = entry?.meetsView ?? true;
      if (!entry) {
        const glow = glows.shift();
        this.flareSkipped[index] = false;
        if (glow) {
          light.position.set(...glow.position);
          light.color.set(glow.color);
          light.distance = glow.radiusMetres;
          this.glowSphere.center.copy(light.position);
          this.glowSphere.radius = glow.radiusMetres;
          this.itemVisible[index] = this.glowFrustum.intersectsSphere(this.glowSphere);
          light.intensity = worldIntensity(glow.intensity, context, this.itemVisible[index]);
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
      light.intensity = worldIntensity(spec.intensity, context, entry.meetsView);
      this.flareSkipped[index] = spec.nightVision !== undefined;
      this.syncHandLight(index, light);
    }
    // Item lamps are walled by their own cube shadow maps (render/shadows.ts), so only fixtures take a reach grid.
    for (let slot = this.itemSlots; slot < this.size; slot++) {
      this.reachSlots[slot] = fixtures[slot - this.itemSlots];
    }
  }
}
