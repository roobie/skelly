import { type ActorSystemOptions, ActorSystem as CoreActorSystem } from '../src/core/actorSystem.ts';
import { siteGenerationOf } from '../src/core/sitePalette.ts';
import { baseRegistry } from './baseRegistry.ts';

const liveness = siteGenerationOf(baseRegistry());

/** Tests unrelated to liveness use the bundled world policy. */
export class ActorSystem extends CoreActorSystem {
  constructor(options: Omit<ActorSystemOptions, 'activeActorRadiusMetres'> & { activeActorRadiusMetres?: number }) {
    super({ activeActorRadiusMetres: liveness.activeActorRadiusMetres, ...options });
  }
}
