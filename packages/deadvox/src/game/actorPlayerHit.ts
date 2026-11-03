import type { Simulation } from '../core/sim.ts';
import { type ActorPlayerHit, pickActorHitRegion } from '../core/zombies.ts';

export const applyActorPlayerHit = (sim: Simulation, hit: ActorPlayerHit): void => {
  const region = pickActorHitRegion(hit.hitRegions, hit.regionRoll);
  sim.hit(hit.damage, hit.cause, region, { kind: hit.kind });
};
