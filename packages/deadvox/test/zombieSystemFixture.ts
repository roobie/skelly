import type { ActorSystemOptions } from '@skelly/engine/internal/core/actorSystem.ts';
import { ActorSystem as CoreActorSystem } from '@skelly/engine/sim';
import { siteGenerationOf } from '@skelly/engine/world';
import { baseRegistry } from './baseRegistry.ts';

const liveness = siteGenerationOf(baseRegistry());

/** Tests unrelated to liveness use the bundled world policy. */
export class ActorSystem extends CoreActorSystem {
  constructor(options: Omit<ActorSystemOptions, 'activeActorRadiusMetres'> & { activeActorRadiusMetres?: number }) {
    super({ activeActorRadiusMetres: liveness.activeActorRadiusMetres, ...options });
  }
}
