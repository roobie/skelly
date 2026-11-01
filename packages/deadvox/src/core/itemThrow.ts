import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { coreMessage } from './coreText.ts';
import { worldGravity } from './gravity.ts';
import type { Inventory, Target } from './inventory.ts';
import { defOf, type Item, weightOf } from './items.ts';
import { raycast, type SolidAt } from './raycast.ts';
import { reachTuning } from './reach.ts';

export const hasMetThrowMinimumHold = (heldSimSeconds: number, minimumHoldSimSeconds: number): boolean =>
  heldSimSeconds >= minimumHoldSimSeconds;

const DRAG_FLIGHT_STEPS = 1024;
/** Drag deceleration per squared speed, from the footprint area pushing against the air for the item's mass. */
const dragPerMetre = (item: Item, registry: Registry, massKg: number): number => {
  const { cellMetres, throwDrag } = reachTuning(registry);
  const [w, h] = defOf(registry, item.type).size;
  const areaSquareMetres = w * h * cellMetres ** 2;
  return massKg > 0
    ? (throwDrag.airDensityKgPerCubicMetre * throwDrag.footprintDragCoefficient * areaSquareMetres) / (2 * massKg)
    : 0;
};

export const throwDistanceForItem = (
  item: Item,
  registry: Registry,
  {
    maximumDistanceMetres,
    chargeSimSeconds,
    armSpeedMetresPerRealSecond,
    armEnergyJoules,
  }: {
    maximumDistanceMetres: number;
    chargeSimSeconds: number;
    armSpeedMetresPerRealSecond: number;
    armEnergyJoules: number;
  },
  heldSimSeconds: number,
): number => {
  const massKg = weightOf(registry, item) / 1000;
  const armSpeedSquared = armSpeedMetresPerRealSecond ** 2;
  const energyLimitedSpeedSquared = massKg > 0 ? (2 * armEnergyJoules) / massKg : armSpeedSquared;
  const rangeFactor = Math.min(1, energyLimitedSpeedSquared / armSpeedSquared);
  const chargeFraction = Math.max(0, Math.min(1, heldSimSeconds / chargeSimSeconds));
  const dragFreeMetres = maximumDistanceMetres * rangeFactor * chargeFraction;
  return dragFreeMetres;
};

export const itemFlightPoint = (from: Vec3, to: Vec3, progress: number, flight: ItemFlight): Vec3 => {
  const t = Math.max(0, Math.min(1, progress));
  if (t === 0) {
    return from;
  }
  if (t === 1) {
    return to;
  }
  const index = t * (flight.points.length - 1);
  const low = Math.floor(index);
  const a = flight.points[low]!;
  const b = flight.points[Math.min(low + 1, flight.points.length - 1)]!;
  const start = flight.points[0]!;
  const end = flight.points.at(-1)!;
  // Pile display poses are sub-cell offsets from the collision path, not a second flight.
  return a.map(
    (axis, i) => axis + (b[i]! - axis) * (index - low) + (from[i]! - start[i]!) * (1 - t) + (to[i]! - end[i]!) * t,
  ) as Vec3;
};

export const settleOnWorld = (position: Vec3, blockSize: number, minY: number, isSolid: SolidAt): Vec3 | undefined => {
  const origin: Vec3 = [position[0] / blockSize, position[1] / blockSize, position[2] / blockSize];
  const hit = raycast(origin, [0, -1, 0], origin[1] - minY + 1, isSolid);
  if (!hit) {
    return undefined;
  }
  return [Math.floor(origin[0]), hit.block[1] + 1, Math.floor(origin[2])];
};

/** Why a new item, or a part leaving its slot, can't be put down at `target`, which is undefined with no ground nearby. */
export const putDownRefusal = (
  inventory: Pick<Inventory, 'planAdd' | 'registry'>,
  item: Item,
  target: Target | undefined,
): string | undefined => {
  if (!target) {
    return coreMessage(inventory.registry, 'noLanding');
  }
  return inventory.planAdd(item, target).ok ? undefined : coreMessage(inventory.registry, 'noGroundRoom');
};

/** Where a pile put down in a block cell comes to rest; a solid cell has no room to put it in. */
export const settleCell = (cell: Vec3, blockSize: number, minY: number, isSolid: SolidAt): Vec3 | undefined =>
  isSolid(cell[0], cell[1], cell[2])
    ? undefined
    : settleOnWorld(cell.map((axis) => (axis + 0.5) * blockSize) as Vec3, blockSize, minY, isSolid);

export interface ItemFlight {
  points: Vec3[];
  durationSimSeconds: number;
  landing: Vec3 | undefined;
}

/** Fixed simulation steps are shared by collision and presentation, independent of render frames. */
export const steppedItemFlight = ({
  from,
  direction,
  distanceMetres,
  gravityMetresPerSimSecondSquared,
  flightSimSeconds,
  drag,
  blockSize,
  minY,
  isSolid,
  hitsPoint,
}: {
  from: Vec3;
  direction: Vec3;
  distanceMetres: number;
  gravityMetresPerSimSecondSquared: number;
  flightSimSeconds: number;
  drag: number;
  blockSize: number;
  minY: number;
  isSolid: SolidAt;
  hitsPoint?: (metres: Vec3) => boolean;
}): ItemFlight => {
  const magnitude = Math.hypot(...direction);
  const unit = magnitude > 0 ? direction.map((axis) => axis / magnitude) : [0, 0, 1];
  let velocity = unit.map((axis) => (axis * distanceMetres) / flightSimSeconds) as Vec3;
  const gravity = gravityMetresPerSimSecondSquared;
  const dt = Math.min(flightSimSeconds / DRAG_FLIGHT_STEPS, (blockSize * 0.2) / Math.max(1, Math.hypot(...velocity)));
  // Above this bound explicit drag steps can reverse velocity and diverge instead of landing.
  const stableDrag = Math.min(drag, 0.5 / (dt * Math.max(Math.hypot(...velocity), Math.sqrt(gravity))));
  const points: Vec3[] = [from];
  const blocked =
    hitsPoint ?? ((sample: Vec3) => isSolid(...(sample.map((axis) => Math.floor(axis / blockSize)) as Vec3)));
  if (blocked(from)) {
    return { points, durationSimSeconds: 0, landing: undefined };
  }
  let point = from;
  let elapsed = 0;
  while (point[1] >= minY * blockSize) {
    const speed = Math.hypot(...velocity);
    const acceleration = velocity.map((v, i) => -stableDrag * speed * v - (i === 1 ? gravity : 0));
    const next = point.map((axis, i) => axis + velocity[i]! * dt + 0.5 * acceleration[i]! * dt ** 2) as Vec3;
    if (blocked(next)) {
      break;
    }
    points.push(next);
    velocity = velocity.map((v, i) => v + acceleration[i]! * dt) as Vec3;
    point = next;
    elapsed += dt;
  }
  return { points, durationSimSeconds: elapsed, landing: settleOnWorld(point, blockSize, minY, isSolid) };
};

export const flightForItem = (
  item: Item,
  registry: Registry,
  options: Omit<
    Parameters<typeof steppedItemFlight>[0],
    'drag' | 'gravityMetresPerSimSecondSquared' | 'flightSimSeconds'
  >,
): ItemFlight =>
  steppedItemFlight({
    ...options,
    drag: dragPerMetre(item, registry, weightOf(registry, item) / 1000),
    gravityMetresPerSimSecondSquared: worldGravity(registry),
    flightSimSeconds: reachTuning(registry).throwFlightSimSeconds,
  });
