import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ActorSpawner } from '../src/core/actorSpawns.ts';
import type { ActorSystem } from '../src/core/actorSystem.ts';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { toChunk, type Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ActorDef, SiteLayoutDef } from '../src/core/schema.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const playtest = JSON.parse(readFileSync('mods/skelly.deadvox.scenario.playtest/layouts-playtest.json', 'utf8')) as {
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
const actorSystemFor = (spawned: Spawned[]): ActorSystem =>
  ({
    add: (type: ActorDef, pos: Vec3) => {
      spawned.push({ type: type.id, pos });
      return spawned.length;
    },
    addHorde: () => undefined,
  }) as unknown as ActorSystem;

const campAmalgams = () => {
  const markers = camp.shamblers.filter(({ type }) => type === MARKER_TYPE);
  const { blockSize } = makeScale(0.5);
  const locations = markers.map(({ position }) => {
    const [x, y, z] = position;
    const cx = toChunk(x / blockSize);
    const cz = toChunk(z / blockSize);
    const spawns = site.actorsIn(cx, cz).filter(({ type }) => type === MARKER_TYPE);
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

const load = (spawner: ActorSpawner, spawned: Spawned[], cx: number, cz: number) => {
  spawner.onColumn({ cx, cz, site, registry, actors: actorSystemFor(spawned) });
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
        const spawner = new ActorSpawner();
        const spawned: Spawned[] = [];
        for (const column of order) {
          load(spawner, spawned, column, cz);
        }
        const expected = [...new Set(order)].flatMap((column) =>
          site
            .actorsIn(column, cz)
            .filter(({ type }) => type === MARKER_TYPE)
            .map(({ type, pos }) => ({ type, pos })),
        );
        expect(spawned.filter(({ type }) => type === MARKER_TYPE)).toEqual(expected);
      }
    }
  });

  it('restores every authored camp amalgam without duplicating or losing it', () => {
    const { locations, everyMarkerHasSpawn } = campAmalgams();
    expect(everyMarkerHasSpawn).toBe(true);
    for (const { cx, cz } of locations) {
      const expected = site
        .actorsIn(cx, cz)
        .filter(({ type }) => type === MARKER_TYPE)
        .map(({ type, pos }) => ({ type, pos }));
      const beforeSave = new ActorSpawner();
      const savedActors: Spawned[] = [];
      load(beforeSave, savedActors, cx, cz);
      expect(savedActors.filter(({ type }) => type === MARKER_TYPE)).toEqual(expected);
      const savedLedger = JSON.parse(JSON.stringify(beforeSave.snapshotState())) as readonly string[];

      const afterLoad = new ActorSpawner();
      afterLoad.restoreState(savedLedger);
      const restoredActors = [...savedActors];
      load(afterLoad, restoredActors, cx, cz);

      expect(afterLoad.snapshotState()).toEqual(savedLedger);
      expect(restoredActors.filter(({ type }) => type === MARKER_TYPE)).toEqual(expected);
    }
  });
});
