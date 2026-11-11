import type { ActorSystem } from './actorSystem.ts';
import { type SpawnTimeWindow, spawnWindowOpen } from './clock.ts';
import { type Registry, requireDayCycle } from './content.ts';
import type { ActorSpawn, Site } from './site.ts';
import { freezeSnapshot } from './snapshotData.ts';

/** Chunk-driven spawns with session-lifetime de-duplication: killed actors stay gone. */
export interface ActorColumnLoad {
  cx: number;
  cz: number;
  site: Pick<Site, 'actorsIn' | 'hordesIn'>;
  registry: Registry;
  actors: ActorSystem;
}

export interface ActorSpawnAdvance {
  calendar: number;
  registry: Registry;
  actors: ActorSystem;
}

interface PendingSpawn {
  spawn: ActorSpawn & { window: SpawnTimeWindow };
  cx: number;
  cz: number;
}

export class ActorSpawner {
  private readonly spawned = new Set<string>();
  private readonly pending = new Map<string, PendingSpawn>();

  snapshotState(): readonly string[] {
    return freezeSnapshot([...this.spawned].sort());
  }

  restoreState(state: readonly string[]): void {
    if (new Set(state).size !== state.length || state.some((key) => typeof key !== 'string')) {
      throw new Error('Invalid actor spawn ledger');
    }
    this.spawned.clear();
    this.pending.clear();
    for (const key of state) {
      this.spawned.add(key);
    }
  }

  onColumn({ cx, cz, site, registry, actors }: ActorColumnLoad): void {
    for (const spawn of site.actorsIn(cx, cz)) {
      this.consider(spawn, { cx, cz, registry, actors });
    }
    for (const horde of site.hordesIn?.(cx, cz) ?? []) {
      const type = registry.actors.get(horde.type);
      const key = `horde:${horde.id}`;
      if (type && !this.spawned.has(key)) {
        actors.addHorde(key, type, horde.pos, horde.members);
        this.spawned.add(key);
      }
    }
  }

  /** Reconsiders only markers in columns already loaded. */
  advance({ calendar, registry, actors }: ActorSpawnAdvance): void {
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
      } else if (spawnWindowOpen(calendar, spawn.window, requireDayCycle(registry))) {
        this.spawnOnce(key, spawn, registry, actors);
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

  private consider(
    spawn: ActorSpawn,
    { cx, cz, registry, actors }: Pick<ActorColumnLoad, 'cx' | 'cz' | 'registry' | 'actors'>,
  ): void {
    const key = `${spawn.type}:${spawn.pos.join(',')}`;
    if (this.spawned.has(key)) {
      return;
    }
    if (spawn.window) {
      this.pending.set(key, { spawn: { ...spawn, window: spawn.window }, cx, cz });
      return;
    }
    this.spawnOnce(key, spawn, registry, actors);
  }

  private spawnOnce(key: string, spawn: ActorSpawn, registry: Registry, actors: ActorSystem): void {
    const type = registry.actors.get(spawn.type);
    if (type) {
      this.spawned.add(key);
      actors.add(type, spawn.pos, [1, 0, 0]);
    }
  }
}
