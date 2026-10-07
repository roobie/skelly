import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { raycast, type SolidAt } from './raycast.ts';
import { defOf, type Item } from './items.ts';

export const ITEM_FLIGHT_SECONDS = 0.75;
export const ITEM_ARC_HEIGHT_METRES = 1.1;

export const hasMetThrowMinimumHold = (heldSimSeconds: number, minimumHoldSimSeconds: number): boolean =>
  heldSimSeconds >= minimumHoldSimSeconds;

export const throwDistanceForItem = (
  item: Item,
  registry: Registry,
  {
    maximumDistanceMetres,
    chargeSimSeconds,
    armSpeedMetresPerSecond,
    armEnergyJoules,
  }: {
    maximumDistanceMetres: number;
    chargeSimSeconds: number;
    armSpeedMetresPerSecond: number;
    armEnergyJoules: number;
  },
  heldSimSeconds: number,
): number => {
  const massKg = (weightOfItemGrams(item, registry) / 1000);
  const armSpeedSquared = armSpeedMetresPerSecond ** 2;
  const energyLimitedSpeedSquared = massKg > 0 ? (2 * armEnergyJoules) / massKg : armSpeedSquared;
  const rangeFactor = Math.min(1, energyLimitedSpeedSquared / armSpeedSquared);
  const chargeFraction = Math.max(0, Math.min(1, heldSimSeconds / chargeSimSeconds));
  return maximumDistanceMetres * rangeFactor * chargeFraction;
};

const weightOfItemGrams = (item: Item, registry: Registry): number => {
  const def = defOf(registry, item.type);
  return def.weight * item.count;
};

export const itemFlightPoint = (from: Vec3, to: Vec3, progress: number): Vec3 => {
  const t = Math.max(0, Math.min(1, progress));
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t + Math.sin(Math.PI * t) * ITEM_ARC_HEIGHT_METRES,
    from[2] + (to[2] - from[2]) * t,
  ];
};

const settleOnWorld = (position: Vec3, blockSize: number, minY: number, isSolid: SolidAt): Vec3 | undefined => {
  const origin: Vec3 = [position[0] / blockSize, position[1] / blockSize, position[2] / blockSize];
  const hit = raycast(origin, [0, -1, 0], origin[1] - minY + 1, isSolid);
  if (!hit) {
    return undefined;
  }
  return [Math.floor(origin[0]), hit.block[1] + 1, Math.floor(origin[2])];
};

/** Sweeps a thrown item's presentation arc through voxels, then settles it on the first solid below it. */
export const traceItemLanding = ({
  from,
  direction,
  distanceMetres,
  blockSize,
  minY,
  isSolid,
}: {
  from: Vec3;
  direction: Vec3;
  distanceMetres: number;
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
    const point = itemFlightPoint(from, to, step / steps);
    if (isSolid(Math.floor(point[0] / blockSize), Math.floor(point[1] / blockSize), Math.floor(point[2] / blockSize))) {
      return step === 0 ? undefined : settleOnWorld(lastSafe, blockSize, minY, isSolid);
    }
    lastSafe = point;
  }
  return settleOnWorld(lastSafe, blockSize, minY, isSolid);
};
