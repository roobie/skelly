import type { Registry } from './content.ts';
import type { Site } from './site.ts';
import type { ZombieSystem } from './zombies.ts';

/** Chunk-driven spawns with session-lifetime de-duplication: killed shamblers stay gone. */
export interface ZombieColumnLoad {
  cx: number;
  cz: number;
  site: Site;
  registry: Registry;
  zombies: ZombieSystem;
}

export class ZombieSpawner {
  private readonly spawned = new Set<string>();

  onColumn({ cx, cz, site, registry, zombies }: ZombieColumnLoad): void {
    for (const spawn of site.zombiesIn(cx, cz)) {
      const key = `${spawn.type}:${spawn.pos.join(',')}`;
      if (this.spawned.has(key)) {
        continue;
      }
      const type = registry.zombies.get(spawn.type);
      if (type) {
        this.spawned.add(key);
        zombies.add(type, spawn.pos, [1, 0, 0]);
      }
    }
  }
}
