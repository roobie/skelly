import { type SpawnTimeWindow, spawnWindowOpen } from './clock.ts';
import type { Registry } from './content.ts';
import type { Site, ZombieSpawn } from './site.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { ZombieSystem } from './zombies.ts';

/** Chunk-driven spawns with session-lifetime de-duplication: killed shamblers stay gone. */
export interface ZombieColumnLoad {
  cx: number;
  cz: number;
  site: Site;
  registry: Registry;
  zombies: ZombieSystem;
  calendar: number;
}

export interface ZombieSpawnAdvance {
  calendar: number;
  registry: Registry;
  zombies: ZombieSystem;
}

interface PendingSpawn {
  spawn: ZombieSpawn & { window: SpawnTimeWindow };
  cx: number;
  cz: number;
}

export class ZombieSpawner {
  private readonly spawned = new Set<string>();
  private readonly pending = new Map<string, PendingSpawn>();

  snapshotState(): readonly string[] {
    return freezeSnapshot([...this.spawned].sort());
  }

  restoreState(state: readonly string[]): void {
    if (new Set(state).size !== state.length || state.some((key) => typeof key !== 'string')) {
      throw new Error('Invalid zombie spawn ledger');
    }
    this.spawned.clear();
    this.pending.clear();
    for (const key of state) {
      this.spawned.add(key);
    }
  }

  onColumn({ cx, cz, site, registry, zombies, calendar }: ZombieColumnLoad): void {
    for (const spawn of site.zombiesIn(cx, cz)) {
      this.consider(spawn, { cx, cz, calendar, registry, zombies });
    }
  }

  /** Reconsiders only markers in columns already loaded. */
  advance({ calendar, registry, zombies }: ZombieSpawnAdvance): void {
    // Restore can load columns in another order; preserve marker-to-id and RNG assignment.
    const pending = [...this.pending].sort(([left], [right]) => {
      if (left === right) {
        return 0;
      }
      return left < right ? -1 : 1;
    });
    for (const [key, { spawn }] of pending) {
      if (this.spawned.has(key)) {
        this.pending.delete(key);
      } else if (spawnWindowOpen(calendar, spawn.window)) {
        this.spawnOnce(key, spawn, registry, zombies);
        this.pending.delete(key);
      }
    }
  }

  /** A closed-window marker is eligible only while the column that contains it stays loaded. */
  unloadColumn(cx: number, cz: number): void {
    for (const [key, pending] of this.pending) {
      if (pending.cx === cx && pending.cz === cz) {
        this.pending.delete(key);
      }
    }
  }

  private consider(spawn: ZombieSpawn, { cx, cz, calendar, registry, zombies }: Omit<ZombieColumnLoad, 'site'>): void {
    const key = `${spawn.type}:${spawn.pos.join(',')}`;
    if (this.spawned.has(key)) {
      return;
    }
    if (spawn.window && !spawnWindowOpen(calendar, spawn.window)) {
      this.pending.set(key, { spawn: { ...spawn, window: spawn.window }, cx, cz });
      return;
    }
    this.spawnOnce(key, spawn, registry, zombies);
  }

  private spawnOnce(key: string, spawn: ZombieSpawn, registry: Registry, zombies: ZombieSystem): void {
    const type = registry.zombies.get(spawn.type);
    if (type) {
      this.spawned.add(key);
      zombies.add(type, spawn.pos, [1, 0, 0]);
    }
  }
}
