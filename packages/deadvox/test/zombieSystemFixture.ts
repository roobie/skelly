import { siteGenerationOf } from '../src/core/sitePalette.ts';
import { ZombieSystem as CoreZombieSystem, type ZombieSystemOptions } from '../src/core/zombies.ts';
import { baseRegistry } from './baseRegistry.ts';

const liveness = siteGenerationOf(baseRegistry());

/** Tests unrelated to liveness use the bundled world policy. */
export class ZombieSystem extends CoreZombieSystem {
  constructor(options: Omit<ZombieSystemOptions, 'activeZombieRadiusMetres'> & { activeZombieRadiusMetres?: number }) {
    super({ activeZombieRadiusMetres: liveness.activeZombieRadiusMetres, ...options });
  }
}
