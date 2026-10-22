import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { coreMessage } from './coreText.ts';
import type { Inventory, Target } from './inventory.ts';
import { defOf, type Item, weightOf } from './items.ts';
import { raycast, type SolidAt } from './raycast.ts';
import { reachTuning } from './reach.ts';

export const hasMetThrowMinimumHold = (heldSimSeconds: number, minimumHoldSimSeconds: number): boolean =>
  heldSimSeconds >= minimumHoldSimSeconds;

const DRAG_FLIGHT_STEPS = 1024;
// Explicit steps stay stable while drag × speed × dt is at most a half; above release height no speed exceeds launch.
const STABLE_DRAG = DRAG_FLIGHT_STEPS / (2 * Math.SQRT2);

/**
 * The share of its drag-free range that a 45-degree throw keeps against quadratic drag, back at release height.
 * Scaled so launch speed, gravity and the drag-free range are all 1, the flight depends only on the drag per metre
 * of drag-free range, `dragPerMetre * dragFreeRangeMetres`, so no gravity constant is needed. Drag beyond the
 * stepper's stable limit is clamped to it: the throw already keeps almost none of its range there, and past it the
 * stepped arc diverges and never lands.
 */
export const dragRangeShare = (drag: number): number => {
  const dt = Math.SQRT2 / DRAG_FLIGHT_STEPS;
  const stableDrag = Math.min(drag, STABLE_DRAG);
  let [x, y] = [0, 0];
  let [vx, vy] = [Math.SQRT1_2, Math.SQRT1_2];
  for (;;) {
    const speed = Math.hypot(vx, vy);
    const ax = -stableDrag * speed * vx;
    const ay = -1 - stableDrag * speed * vy;
    const nextX = x + vx * dt + 0.5 * ax * dt * dt;
    const nextY = y + vy * dt + 0.5 * ay * dt * dt;
    if (nextY <= 0 && vy < 0) {
      return x + ((nextX - x) * y) / (y - nextY);
    }
    [x, y] = [nextX, nextY];
    [vx, vy] = [vx + ax * dt, vy + ay * dt];
  }
};

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
  return dragFreeMetres * dragRangeShare(dragPerMetre(item, registry, massKg) * dragFreeMetres);
};

export const itemFlightPoint = (from: Vec3, to: Vec3, progress: number, arcHeightMetres: number): Vec3 => {
  const t = Math.max(0, Math.min(1, progress));
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t + Math.sin(Math.PI * t) * arcHeightMetres,
    from[2] + (to[2] - from[2]) * t,
  ];
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

/** Sweeps a thrown item's presentation arc through voxels, then settles it on the first solid below it. */
export const traceItemLanding = ({
  from,
  direction,
  distanceMetres,
  arcHeightMetres,
  blockSize,
  minY,
  isSolid,
}: {
  from: Vec3;
  direction: Vec3;
  distanceMetres: number;
  arcHeightMetres: number;
  blockSize: number;
  minY: number;
  isSolid: SolidAt;
}): Vec3 | undefined => {
  const magnitude = Math.hypot(...direction);
  const unit: Vec3 = magnitude > 0 ? (direction.map((axis) => axis / magnitude) as Vec3) : [0, 0, 1];
  const to: Vec3 = [
    from[0] + unit[0] * distanceMetres,
    from[1] + unit[1] * distanceMetres,
    from[2] + unit[2] * distanceMetres,
  ];
  const stepMetres = Math.min(blockSize * 0.35, 0.2);
  const steps = Math.max(1, Math.ceil(distanceMetres / stepMetres));
  let lastSafe = from;
  for (let step = 0; step <= steps; step++) {
    const point = itemFlightPoint(from, to, step / steps, arcHeightMetres);
    if (isSolid(Math.floor(point[0] / blockSize), Math.floor(point[1] / blockSize), Math.floor(point[2] / blockSize))) {
      return step === 0 ? undefined : settleOnWorld(lastSafe, blockSize, minY, isSolid);
    }
    lastSafe = point;
  }
  return settleOnWorld(lastSafe, blockSize, minY, isSolid);
};
