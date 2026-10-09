import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { buildRegistry } from '../src/core/content.ts';
import { toChunk, type Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SiteLayoutDef, ZombieDef } from '../src/core/schema.ts';
import { ZombieSpawner } from '../src/core/zombieSpawns.ts';
import type { ZombieSystem } from '../src/core/zombies.ts';

const BASE = 'src/content/base';
const files = readdirSync(BASE)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown }));
const { registry } = buildRegistry(files);
const playtest = files.find((file) => file.source === 'layouts-playtest.json')!.data as {
  layouts: SiteLayoutDef[];
};
const camp = registry.layouts.get(playtest.layouts[0]!.id)!;
const site = new AuthoredSite(1, registry, makeScale(0.5), camp);

interface Spawned {
  type: string;
  pos: Vec3;
}
const zombieSystemFor = (spawned: Spawned[]): ZombieSystem =>
  ({
    add: (type: ZombieDef, pos: Vec3) => {
      spawned.push({ type: type.id, pos });
      return spawned.length;
    },
    addHorde: () => undefined,
  }) as unknown as ZombieSystem;

const campAmalgam = () => {
  const markers = camp.shamblers.filter(({ type }) => type === 'amalgam');
  const [marker] = markers;
  if (!marker) {
    return { markers, location: undefined };
  }
  const [x, , z] = marker.position;
  const { blockSize } = makeScale(0.5);
  const cx = toChunk(x / blockSize);
  const cz = toChunk(z / blockSize);
  const spawn = site.zombiesIn(cx, cz).find(({ type }) => type === 'amalgam');
  return { markers, location: spawn ? { cx, cz, spawn } : undefined };
};

const load = (spawner: ZombieSpawner, spawned: Spawned[], cx: number, cz: number) => {
  spawner.onColumn({ cx, cz, site, registry, zombies: zombieSystemFor(spawned) });
};

describe('authored zombie spawn persistence', () => {
  it('spawns the authored camp amalgam on its first column load only', () => {
    const { markers, location } = campAmalgam();
    expect(markers).toHaveLength(1);
    expect(location).toBeDefined();
    const { cx, cz, spawn } = location!;
    for (const order of [
      [cx + 1, cx, cx + 1],
      [cx, cx + 1, cx],
    ]) {
      const spawner = new ZombieSpawner();
      const spawned: Spawned[] = [];
      for (const column of order) {
        load(spawner, spawned, column, cz);
      }
      expect(spawned.filter(({ type }) => type === 'amalgam')).toEqual([{ type: 'amalgam', pos: spawn.pos }]);
    }
  });

  it('restores the spawn ledger without duplicating or losing the saved amalgam', () => {
    const { markers, location } = campAmalgam();
    expect(markers).toHaveLength(1);
    expect(location).toBeDefined();
    const { cx, cz, spawn } = location!;
    const beforeSave = new ZombieSpawner();
    const savedZombies: Spawned[] = [];
    load(beforeSave, savedZombies, cx, cz);
    const savedLedger = JSON.parse(JSON.stringify(beforeSave.snapshotState())) as readonly string[];

    const afterLoad = new ZombieSpawner();
    afterLoad.restoreState(savedLedger);
    const restoredZombies = [...savedZombies];
    load(afterLoad, restoredZombies, cx, cz);

    expect(afterLoad.snapshotState()).toEqual(savedLedger);
    expect(restoredZombies.filter(({ type }) => type === 'amalgam')).toEqual([{ type: 'amalgam', pos: spawn.pos }]);
  });
});
