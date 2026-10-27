import type { Simulation } from '../core/sim.ts';
import { pickZombieHitRegion, type ZombiePlayerHit } from '../core/zombies.ts';

export const applyZombiePlayerHit = (sim: Simulation, hit: ZombiePlayerHit): void => {
  const region = pickZombieHitRegion(hit.hitRegions, hit.regionRoll);
  sim.hit(hit.damage, hit.cause, region, { kind: hit.kind });
};
