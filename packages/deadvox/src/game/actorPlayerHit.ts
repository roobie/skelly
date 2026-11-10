import { type ActorPlayerHit, pickActorHitRegion } from '../../../engine/src/core/actorSystem.ts';
import type { Simulation } from '../../../engine/src/core/sim.ts';

export const applyActorPlayerHit = (sim: Simulation, hit: ActorPlayerHit): void => {
  const region = pickActorHitRegion(hit.hitRegions, hit.regionRoll);
  sim.hit(hit.damage, hit.cause, region, { kind: hit.kind });
};
