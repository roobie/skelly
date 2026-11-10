import { describe, expect, it } from 'vitest';
import { ActorSpawner } from '../src/core/actorSpawns.ts';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import type { SiteLayoutDef } from '../src/core/schema.ts';
import type { ActorDef } from '../src/engine/content.ts';
import type { ActorSystem } from '../src/engine/sim.ts';
import { CHUNK, makeScale, toChunk, type Vec3 } from '../src/engine/world.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const scale = makeScale(0.5);
const chunkMetres = CHUNK * scale.blockSize;
const markerType = registry.actors.keys().next().value!;
// Always-spawning markers: two share the first column, one sits in the column east of it.
const layout: SiteLayoutDef = {
  id: 'fixture_spawn_ledger',
  lootContext: { usage: ['Residential'], tier: 'Tier1' },
  bounds: { x0: 0, z0: 0, x1: chunkMetres * 2, z1: chunkMetres },
  ground: 0,
  terrain: [],
  buildings: [],
  player: { position: [1, 0.5, 1], bearing: 0 },
  shamblers: [
    { type: markerType, position: [chunkMetres / 4, 0.5, chunkMetres / 2], chance: 1 },
    { type: markerType, position: [chunkMetres / 2, 0.5, chunkMetres / 2], chance: 1 },
    { type: markerType, position: [chunkMetres * 1.5, 0.5, chunkMetres / 2], chance: 1 },
  ],
  woodlands: [],
  tracks: [],
};
const site = new AuthoredSite(1, registry, scale, layout);
const cz = toChunk(layout.shamblers[0]!.position[2] / scale.blockSize);
const markerColumns = [...new Set(layout.shamblers.map(({ position }) => toChunk(position[0] / scale.blockSize)))];

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

const markersIn = (cx: number) => site.actorsIn(cx, cz).map(({ type, pos }) => ({ type, pos }));

const load = (spawner: ActorSpawner, spawned: Spawned[], cx: number) => {
  spawner.onColumn({ cx, cz, site, registry, actors: actorSystemFor(spawned) });
};

describe('authored actor spawn persistence', () => {
  it('spawns every authored marker on its first column load only, in either load order', () => {
    expect(markerColumns).toHaveLength(2);
    expect(markerColumns.flatMap(markersIn)).toHaveLength(layout.shamblers.length);
    const [west, east] = markerColumns as [number, number];
    for (const order of [
      [east, west, east],
      [west, east, west],
    ]) {
      const spawner = new ActorSpawner();
      const spawned: Spawned[] = [];
      for (const column of order) {
        load(spawner, spawned, column);
      }
      expect(spawned).toEqual([...new Set(order)].flatMap(markersIn));
    }
  });

  it('restores the spawn ledger without duplicating or losing a marker', () => {
    for (const cx of markerColumns) {
      const expected = markersIn(cx);
      expect(expected.length).toBeGreaterThan(0);
      const beforeSave = new ActorSpawner();
      const savedActors: Spawned[] = [];
      load(beforeSave, savedActors, cx);
      expect(savedActors).toEqual(expected);
      const savedLedger = JSON.parse(JSON.stringify(beforeSave.snapshotState())) as readonly string[];

      const afterLoad = new ActorSpawner();
      afterLoad.restoreState(savedLedger);
      const restoredActors = [...savedActors];
      load(afterLoad, restoredActors, cx);

      expect(afterLoad.snapshotState()).toEqual(savedLedger);
      expect(restoredActors).toEqual(expected);
    }
  });
});
