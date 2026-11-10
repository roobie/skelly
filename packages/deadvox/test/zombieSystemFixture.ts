import type { ActorSystemOptions } from '../../engine/src/core/actorSystem.ts';
import { ActorSystem as CoreActorSystem } from '../../engine/src/sim.ts';
import { siteGenerationOf } from '../../engine/src/world.ts';
import { baseRegistry } from './baseRegistry.ts';

const liveness = siteGenerationOf(baseRegistry());

/** Tests unrelated to liveness use the bundled world policy. */
export class ActorSystem extends CoreActorSystem {
  constructor(options: Omit<ActorSystemOptions, 'activeActorRadiusMetres'> & { activeActorRadiusMetres?: number }) {
    super({ activeActorRadiusMetres: liveness.activeActorRadiusMetres, ...options });
  }
}
