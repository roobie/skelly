import type { Simulation } from '@skelly/engine/sim';
import { type ActorPlayerHit, pickActorHitRegion } from '@skelly/engine/sim';

export const applyActorPlayerHit = (sim: Simulation, hit: ActorPlayerHit): void => {
  const region = pickActorHitRegion(hit.hitRegions, hit.regionRoll);
  sim.hit(hit.damage, hit.cause, region, { kind: hit.kind });
};
