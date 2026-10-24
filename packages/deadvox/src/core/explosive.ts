import type { BodyRegion } from './body.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { Item } from './items.ts';
import type { Body } from './physics.ts';
import type { Rng } from './random.ts';
import { raycast, type SolidAt } from './raycast.ts';
import type { BodyTuningDef, ItemDef } from './schema.ts';
import { rayBoxEntry } from './zombieRegions.ts';

/** A thrown charge's content (`DESIGN.md`, "Hand grenade"). */
export type ExplosiveSpec = NonNullable<ItemDef['explosive']>;

/** Where an explosive's pin and fuse stand: pin in, pin pulled while still held, or fuse burning. */
export type PinState = 'in' | 'pulled' | 'burning';

/**
 * Explosives with the pin pulled, and the fuses burning. Pin and fuse are saved on the item, so a restored game
 * picks up the ones it finds in `items` where they left off.
 */
export class Fuses {
  private readonly burning = new Set<Item>();
  /** Pin pulled, fuse waiting for the item to leave the hand. */
  private readonly live = new Set<Item>();
  private readonly registry: Registry;
  private readonly pinMoved: () => void;

  /** `pinMoved` hears each pull or push of a pin, which changes how the item draws. */
  constructor(registry: Registry, items: Iterable<Item>, pinMoved: () => void) {
    this.registry = registry;
    this.pinMoved = pinMoved;
    for (const item of items) {
      if (item.fuseRemainingSimSeconds !== undefined) {
        this.burning.add(item);
      } else if (item.pinPulled) {
        this.live.add(item);
      }
    }
  }

  /** The pin's state, or undefined for an item that isn't an explosive. */
  state(item: Item): PinState | undefined {
    if (!this.registry.items.get(item.type)?.explosive) {
      return undefined;
    }
    if (item.fuseRemainingSimSeconds !== undefined) {
      return 'burning';
    }
    return item.pinPulled ? 'pulled' : 'in';
  }

  /** Pulls the pin, or pushes a pulled one back in; nothing stops a burning fuse. Returns the state after. */
  togglePin(item: Item): PinState | undefined {
    const state = this.state(item);
    if (state === 'in') {
      item.pinPulled = true;
      this.live.add(item);
      this.pinMoved();
      return 'pulled';
    }
    if (state === 'pulled') {
      item.pinPulled = undefined;
      this.live.delete(item);
      this.pinMoved();
      return 'in';
    }
    return state;
  }

  /**
   * Burns every fuse by `dt` Sim seconds, then lights the fuse of each explosive with its pin pulled that is no
   * longer `held`, telling `lit` about each. Returns the explosives whose fuse ran out, by uid.
   */
  advance(dt: number, held: (item: Item) => boolean, lit?: (item: Item) => void): Item[] {
    const done: Item[] = [];
    for (const item of this.burning) {
      item.fuseRemainingSimSeconds = Math.max(0, item.fuseRemainingSimSeconds! - dt);
      if (item.fuseRemainingSimSeconds === 0) {
        this.burning.delete(item);
        done.push(item);
      }
    }
    for (const item of this.live) {
      if (!held(item)) {
        this.live.delete(item);
        item.fuseRemainingSimSeconds = this.registry.items.get(item.type)!.explosive!.fuseSimSeconds;
        this.burning.add(item);
        lit?.(item);
      }
    }
    return done.sort((a, b) => a.uid - b.uid);
  }
}

/** The share of a blast's damage and push at a distance: all of it at the centre, falling linearly to none at the radius. */
export const blastShare = ({ radiusMetres }: ExplosiveSpec['blast'], distanceMetres: number): number =>
  Math.max(0, 1 - distanceMetres / radiusMetres);

/** A body's centre, in blocks. */
export const bodyCentre = (body: Body): Vec3 => [body.pos[0], body.pos[1] + body.height / 2, body.pos[2]];

/** Whether nothing solid lies on the straight line between two points, in blocks. */
export const inSight = (from: Vec3, to: Vec3, isSolid: SolidAt): boolean => {
  const delta: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const distance = Math.hypot(...delta);
  return (
    distance === 0 ||
    raycast(from, [delta[0] / distance, delta[1] / distance, delta[2] / distance], distance, isSolid) === undefined
  );
};

/** `count` directions drawn uniformly at random over the sphere. */
export const fragmentDirections = (rng: Rng, count: number): Vec3[] =>
  Array.from({ length: count }, (): Vec3 => {
    const y = 2 * rng.next() - 1;
    const angle = 2 * Math.PI * rng.next();
    const ring = Math.sqrt(1 - y * y);
    return [ring * Math.cos(angle), y, ring * Math.sin(angle)];
  });

/**
 * The regions of an upright body that fragments strike, one per hit: each ray that enters the body's box within
 * range with nothing solid before it. The struck height picks the region, and the side of the body's centre picks
 * a leg; arms aren't told apart from the torso.
 */
export const fragmentHitsOnBody = ({
  origin,
  directions,
  rangeBlocks,
  body,
  isSolid,
  regionHeights,
}: {
  origin: Vec3;
  directions: readonly Vec3[];
  rangeBlocks: number;
  body: Body;
  isSolid: SolidAt;
  regionHeights: BodyTuningDef['fragmentRegionHeights'];
}): BodyRegion[] => {
  const centre = bodyCentre(body);
  const local: Vec3 = [origin[0] - centre[0], origin[1] - centre[1], origin[2] - centre[2]];
  const half = [body.halfWidth, body.height / 2, body.halfDepth ?? body.halfWidth];
  return directions.flatMap((direction) => {
    const distance = rayBoxEntry(local, direction, half);
    if (distance === undefined || distance > rangeBlocks || raycast(origin, direction, distance, isSolid)) {
      return [];
    }
    const height = (local[1] + direction[1] * distance) / body.height + 0.5;
    if (height >= regionHeights.head) {
      return ['head'];
    }
    if (height >= regionHeights.torso) {
      return ['torso'];
    }
    return [local[0] + direction[0] * distance < 0 ? 'leftLeg' : 'rightLeg'];
  });
};
