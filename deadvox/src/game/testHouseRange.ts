import type { ItemDef, Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Rolled } from '../core/loot.ts';
import { ammoMatchesCalibre, firearmModelForType } from './firearmHandling.ts';
import { GARDEN_GATE, HOUSE_OFFSET } from './testHouse.ts';

export interface TestHouseRangeWaypoint {
  readonly id: string;
  readonly axis: 0 | 2;
  readonly target: number;
}

export interface TestHouseRangeRoute {
  readonly gateCentreX: number;
  readonly gateClearance: number;
  readonly waypoints: readonly TestHouseRangeWaypoint[];
}

/** Waypoint geometry shared by the unit and browser collision contracts for the debug range. */
export const buildTestHouseRangeRoute = ({
  blockSize,
  playerHalfWidth,
  rack,
}: {
  blockSize: number;
  playerHalfWidth: number;
  rack: { readonly pos: Vec3; readonly size: Vec3 };
}): TestHouseRangeRoute => {
  const corridorZ = (HOUSE_OFFSET[1] + GARDEN_GATE.approachZ) / blockSize;
  const gateCentreX = (HOUSE_OFFSET[0] + GARDEN_GATE.centreX) / blockSize;
  const gateClearance = GARDEN_GATE.widthM / (2 * blockSize) - playerHalfWidth;
  if (gateClearance <= 0) {
    throw new Error('Player does not fit through the test-house garden gate');
  }
  return {
    gateCentreX,
    gateClearance,
    waypoints: [
      { id: 'approach-gate', axis: 2, target: corridorZ },
      { id: 'enter-gate', axis: 0, target: gateCentreX - gateClearance },
      { id: 'centre-in-gate', axis: 0, target: gateCentreX },
      { id: 'exit-gate', axis: 2, target: (HOUSE_OFFSET[1] + GARDEN_GATE.exitZ) / blockSize },
      { id: 'approach-rack', axis: 0, target: rack.pos[0] - 1 },
      {
        id: 'rack-facing-stop',
        axis: 2,
        target: rack.pos[2] + rack.size[2] + playerHalfWidth + 0.2 / blockSize,
      },
    ],
  };
};

/** Add-ons join the debug range when the item schema defines either capability. */
export const isTestHouseRangeStockItem = (item: ItemDef): boolean =>
  item.firearm !== undefined || Object.hasOwn(item, 'mod') || Object.hasOwn(item, 'mount');

/** Firearms, compatible loose ammunition, and any package that unpacks to that ammunition. */
export const testHouseRangeStock = (registry: Registry): Rolled[] => {
  const items = [...registry.items.values()];
  const firearms = items.filter((item) => item.firearm !== undefined);
  const calibres = new Set(
    firearms
      .map((item) => firearmModelForType(item.id, registry)?.calibre)
      .filter((calibre): calibre is string => calibre !== undefined),
  );
  const stock = new Set(items.filter(isTestHouseRangeStockItem).map(({ id }) => id));
  const compatibleCalibres = [...calibres];

  for (const item of items) {
    if (compatibleCalibres.some((calibre) => ammoMatchesCalibre(item.id, calibre, registry))) {
      stock.add(item.id);
    }
    const unpacked = item.unpack && registry.items.get(item.unpack.item);
    if (unpacked && compatibleCalibres.some((calibre) => ammoMatchesCalibre(unpacked.id, calibre, registry))) {
      stock.add(item.id);
    }
  }

  return [...stock].sort().map((type) => ({ type, count: 1, condition: 1 }));
};
