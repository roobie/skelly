import type { ActorSystemOptions } from '../src/core/actorSystem.ts';
import { ActorSystem as CoreActorSystem } from '../src/engine/sim.ts';
import { siteGenerationOf } from '../src/engine/world.ts';
import { baseRegistry } from './baseRegistry.ts';

const liveness = siteGenerationOf(baseRegistry());

/** Tests unrelated to liveness use the bundled world policy. */
export class ActorSystem extends CoreActorSystem {
  constructor(options: Omit<ActorSystemOptions, 'activeActorRadiusMetres'> & { activeActorRadiusMetres?: number }) {
    super({ activeActorRadiusMetres: liveness.activeActorRadiusMetres, ...options });
  }
}
