import type { Inventory } from '../core/inventory.ts';
import type { BodyTuningDef } from '../core/schema.ts';
import type { Simulation } from '../core/sim.ts';
import { wearOnPlayerHit } from '../core/wear.ts';
import { pickZombieHitRegion, type ZombiePlayerHit } from '../core/zombies.ts';

export const applyZombiePlayerHit = (
  sim: Simulation,
  inventory: Inventory,
  tuning: BodyTuningDef,
  hit: ZombiePlayerHit,
): void => {
  const region = pickZombieHitRegion(hit.hitRegions, hit.regionRoll);
  wearOnPlayerHit(inventory, region, tuning.outerWearMultiplier[hit.kind]);
  sim.hit(hit.damage, `a ${hit.sourceName.toLowerCase()}`, region, { kind: hit.kind });
};
