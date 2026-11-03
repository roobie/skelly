import type { Simulation } from '../core/sim.ts';
import { pickZombieHitRegion, type ActorPlayerHit } from '../core/zombies.ts';

export const applyActorPlayerHit = (sim: Simulation, hit: ActorPlayerHit): void => {
  const region = pickZombieHitRegion(hit.hitRegions, hit.regionRoll);
  sim.hit(hit.damage, hit.cause, region, { kind: hit.kind });
};
