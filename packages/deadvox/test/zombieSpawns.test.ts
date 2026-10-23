import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { toChunk, type Vec3 } from '../src/core/coords.ts';
import { GauntletSite } from '../src/core/gauntlet.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SiteLayoutDef, ZombieDef } from '../src/core/schema.ts';
import { footprint } from '../src/core/templates.ts';
import { ZombieSpawner } from '../src/core/zombieSpawns.ts';
import type { ZombieSystem } from '../src/core/zombies.ts';
import { baseRegistry } from './baseRegistry.ts';
import { GAUNTLET_SITE_MS } from './siteTimeouts.ts';

const registry = baseRegistry();
const playtest = JSON.parse(readFileSync('src/content/base/layouts-playtest.json', 'utf8')) as {
  layouts: SiteLayoutDef[];
};
const camp = registry.layouts.get(playtest.layouts[0]!.id)!;
const site = new AuthoredSite(1, registry, makeScale(0.5), camp);
// A type the playtest camp places at fixed, always-spawning markers; plain shamblers are also placed by density.
const MARKER_TYPE = 'amalgam';

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
  const markers = camp.shamblers.filter(({ type }) => type === MARKER_TYPE);
  const { blockSize } = makeScale(0.5);
  const locations = markers.map(({ position }) => {
    const [x, y, z] = position;
    const cx = toChunk(x / blockSize);
    const cz = toChunk(z / blockSize);
    const spawns = site.zombiesIn(cx, cz).filter(({ type }) => type === MARKER_TYPE);
    const markerSpawn = { type: MARKER_TYPE, pos: [x / blockSize, y / blockSize, z / blockSize] as Vec3 };
    return { cx, cz, markerSpawn, spawns };
  });
  const everyMarkerHasSpawn =
    markers.length > 0 &&
    locations.every(({ markerSpawn, spawns }) =>
      spawns.some(
        (spawn) =>
          spawn.type === markerSpawn.type &&
          spawn.pos.every((coordinate, index) => coordinate === markerSpawn.pos[index]),
      ),
    );
  return { locations, everyMarkerHasSpawn };
};

const load = (spawner: ZombieSpawner, spawned: Spawned[], cx: number, cz: number) => {
  spawner.onColumn({ cx, cz, site, registry, zombies: zombieSystemFor(spawned) });
};

describe('authored zombie spawn persistence', () => {
  it('spawns every authored camp amalgam on its first column load only', () => {
    const { locations, everyMarkerHasSpawn } = campAmalgams();
    expect(everyMarkerHasSpawn).toBe(true);
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
            .filter(({ type }) => type === MARKER_TYPE)
            .map(({ type, pos }) => ({ type, pos })),
        );
        expect(spawned.filter(({ type }) => type === MARKER_TYPE)).toEqual(expected);
      }
    }
  });

  it(
    'keeps the secret house’s sealed brute shambler through generation and a save round-trip',
    () => {
      const scenario = [...registry.scenarios.values()].find((candidate) => candidate.composition)!;
      const city = new GauntletSite({ seed: 73, registry, scale: makeScale(0.5), scenario });
      const [house, ...others] = city.plan.placements.filter(
        ({ template }) => template.id === 'gauntlet_city_cellar_secret',
      );
      expect(others).toEqual([]);
      const [x0, y0, z0] = house!.origin;
      const [width, depth] = footprint(house!);
      const grade = y0 + house!.template.access!.entrance[1];
      const columns = new Map<string, [number, number]>();
      for (let x = x0; x < x0 + width; x++) {
        for (let z = z0; z < z0 + depth; z++) {
          columns.set(`${toChunk(x)},${toChunk(z)}`, [toChunk(x), toChunk(z)]);
        }
      }
      const sealed = ({ type, pos: [x, y, z] }: Spawned) =>
        type === 'brute_shambler' && x >= x0 && x < x0 + width && z >= z0 && z < z0 + depth && y < grade;
      const loadAll = (spawner: ZombieSpawner, spawned: Spawned[]) => {
        for (const [cx, cz] of columns.values()) {
          spawner.onColumn({ cx, cz, site: city, registry, zombies: zombieSystemFor(spawned) });
        }
      };
      const beforeSave = new ZombieSpawner();
      const saved: Spawned[] = [];
      loadAll(beforeSave, saved);
      expect(saved.filter(sealed)).toHaveLength(1);
      const ledger = JSON.parse(JSON.stringify(beforeSave.snapshotState())) as readonly string[];
      const afterLoad = new ZombieSpawner();
      afterLoad.restoreState(ledger);
      const restored = [...saved];
      loadAll(afterLoad, restored);
      expect(restored.filter(sealed)).toEqual(saved.filter(sealed));
      expect(afterLoad.snapshotState()).toEqual(ledger);
    },
    GAUNTLET_SITE_MS,
  );

  it('restores every authored camp amalgam without duplicating or losing it', () => {
    const { locations, everyMarkerHasSpawn } = campAmalgams();
    expect(everyMarkerHasSpawn).toBe(true);
    for (const { cx, cz } of locations) {
      const expected = site
        .zombiesIn(cx, cz)
        .filter(({ type }) => type === MARKER_TYPE)
        .map(({ type, pos }) => ({ type, pos }));
      const beforeSave = new ZombieSpawner();
      const savedZombies: Spawned[] = [];
      load(beforeSave, savedZombies, cx, cz);
      expect(savedZombies.filter(({ type }) => type === MARKER_TYPE)).toEqual(expected);
      const savedLedger = JSON.parse(JSON.stringify(beforeSave.snapshotState())) as readonly string[];

      const afterLoad = new ZombieSpawner();
      afterLoad.restoreState(savedLedger);
      const restoredZombies = [...savedZombies];
      load(afterLoad, restoredZombies, cx, cz);

      expect(afterLoad.snapshotState()).toEqual(savedLedger);
      expect(restoredZombies.filter(({ type }) => type === MARKER_TYPE)).toEqual(expected);
    }
  });
});
