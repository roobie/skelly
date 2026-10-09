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

const campAmalgams = () => {
  const markers = camp.shamblers.filter(({ type }) => type === 'amalgam');
  const { blockSize } = makeScale(0.5);
  const locations = markers.map(({ position }) => {
    const [x, y, z] = position;
    const cx = toChunk(x / blockSize);
    const cz = toChunk(z / blockSize);
    const spawns = site.zombiesIn(cx, cz).filter(({ type }) => type === 'amalgam');
    const markerSpawn = { type: 'amalgam', pos: [x / blockSize, y / blockSize, z / blockSize] as Vec3 };
    return { cx, cz, markerSpawn, spawns };
  });
  return { markers, locations };
};

const load = (spawner: ZombieSpawner, spawned: Spawned[], cx: number, cz: number) => {
  spawner.onColumn({ cx, cz, site, registry, zombies: zombieSystemFor(spawned) });
};

describe('authored zombie spawn persistence', () => {
  it('spawns every authored camp amalgam on its first column load only', () => {
    const { markers, locations } = campAmalgams();
    expect(markers.length).toBeGreaterThan(0);
    expect(locations).toHaveLength(markers.length);
    expect(
      locations.every(({ markerSpawn, spawns }) =>
        spawns.some(
          (spawn) =>
            spawn.type === markerSpawn.type &&
            spawn.pos.every((coordinate, index) => coordinate === markerSpawn.pos[index]),
        ),
      ),
    ).toBe(true);
    for (const { cx, cz } of locations) {
      for (const order of [
        [cx + 1, cx, cx + 1],
        [cx, cx + 1, cx],
      ]) {
        const spawner = new ZombieSpawner();
        const spawned: Spawned[] = [];
        for (const column of order) {
          load(spawner, spawned, column, cz);
        }
        const expected = [...new Set(order)].flatMap((column) =>
          site
            .zombiesIn(column, cz)
            .filter(({ type }) => type === 'amalgam')
            .map(({ type, pos }) => ({ type, pos })),
        );
        expect(spawned.filter(({ type }) => type === 'amalgam')).toEqual(expected);
      }
    }
  });

  it('restores every authored camp amalgam without duplicating or losing it', () => {
    const { markers, locations } = campAmalgams();
    expect(markers.length).toBeGreaterThan(0);
    expect(locations).toHaveLength(markers.length);
    expect(
      locations.every(({ markerSpawn, spawns }) =>
        spawns.some(
          (spawn) =>
            spawn.type === markerSpawn.type &&
            spawn.pos.every((coordinate, index) => coordinate === markerSpawn.pos[index]),
        ),
      ),
    ).toBe(true);
    for (const { cx, cz } of locations) {
      const expected = site
        .zombiesIn(cx, cz)
        .filter(({ type }) => type === 'amalgam')
        .map(({ type, pos }) => ({ type, pos }));
      const beforeSave = new ZombieSpawner();
      const savedZombies: Spawned[] = [];
      load(beforeSave, savedZombies, cx, cz);
      expect(savedZombies.filter(({ type }) => type === 'amalgam')).toEqual(expected);
      const savedLedger = JSON.parse(JSON.stringify(beforeSave.snapshotState())) as readonly string[];

      const afterLoad = new ZombieSpawner();
      afterLoad.restoreState(savedLedger);
      const restoredZombies = [...savedZombies];
      load(afterLoad, restoredZombies, cx, cz);

      expect(afterLoad.snapshotState()).toEqual(savedLedger);
      expect(restoredZombies.filter(({ type }) => type === 'amalgam')).toEqual(expected);
    }
  });
});
