import type { EntitySpec } from '@skelly/engine/internal/core/blockEntities.ts';
import { SAVE_SCHEMA_VERSION } from '@skelly/engine/internal/core/saveFormat.ts';
import { decodeSave, encodeSave, type SaveSnapshot } from '@skelly/engine/save';
import { configFromUrl, createSession, IDLE } from '@skelly/engine/session';
import {
  CHUNK,
  Chunk,
  columnArrival,
  createWorldSetup,
  NOT_LOADED,
  toChunk,
  type WorldSetup,
} from '@skelly/engine/world';
import { ChunkMeshes } from '@skelly/presentation/render';
import { contentLookup } from '@skelly/presentation/ui';
import { expect, it, vi } from 'vitest';
import { ragdollSweepViewer } from '../src/product/ragdoll.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { startupContent } from './baseRegistry.ts';
import { fixtureBlockMaterial } from './blockMaterialFixture.ts';
import { FIXTURE_MATERIAL, fixtureBreach } from './economyFixtures.ts';
import { quietMesherSource } from './fixtures/quietMesherSource.ts';
import { startedOn } from './fixtures/startupContent.ts';

const content = startupContent();
const { registry } = content;
const crate: EntitySpec = { type: 'fixture_overlay_crate', pos: [3, 1, 1], size: [1, 1, 1], facing: 'n' };
registry.furniture.set(crate.type, {
  id: crate.type,
  name: 'Fixture crate',
  size: crate.size,
  color: '#808080',
  massKg: 1,
  breach: fixtureBreach(),
  material: FIXTURE_MATERIAL,
});
const floor = registry.blocks.length;
registry.blocks.push({
  id: 'fixture_floor',
  material: FIXTURE_MATERIAL,
  name: 'Fixture floor',
  solid: true,
  color: '#808080',
});
registry.blockMaterials.set(FIXTURE_MATERIAL, fixtureBlockMaterial('fixture_floor'));
registry.blockIds.set('fixture_floor', floor);
const cx = toChunk(crate.pos[0]);
const cz = toChunk(crate.pos[2]);

const worldSetup = (): WorldSetup => {
  const config = configFromUrl(new URLSearchParams(), {}, startedOn(content, 'testHouse'), ragdollSweepViewer);
  const source = createWorldSetup(config, new ChunkMeshes(config.scale.blockSize, registry), quietMesherSource());
  vi.spyOn(source.canonicalTerrain.terrain, 'generateColumn').mockImplementation((x, z) =>
    Array.from({ length: config.scale.maxCy - config.scale.minCy + 1 }, (_, at) => {
      const chunk = new Chunk(x, config.scale.minCy + at, z);
      if (chunk.cy === 0) {
        for (let lz = 0; lz < CHUNK; lz++) {
          for (let lx = 0; lx < CHUNK; lx++) {
            chunk.set(lx, 0, lz, floor);
          }
        }
      }
      return chunk;
    }),
  );
  return {
    ...source,
    furnitureIn: () => [{ spec: crate, loot: [] }],
    lootPointsIn: () => [],
    supplySourcesIn: () => [],
    actorsIn: () => [],
  };
};

const session = (source: WorldSetup, restore?: Readonly<SaveSnapshot>) =>
  createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world: source.simulationWorld,
    entities: source.entities,
    isSolid: source.isSolid,
    isOpaque: source.isOpaque,
    scale: source.config.scale,
    seed: source.config.seed,
    start: 0,
    spawn: [1, 1, 1],
    ready: () => false,
    controls: {
      active: () => false,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
    ...(restore ? { restore } : {}),
  });
const version = {
  simulationHash: 'a'.repeat(64),
  schemaVersion: SAVE_SCHEMA_VERSION,
  generators: {},
  contentPacks: [{ id: 'fixture', version: '1', canonicalHash: 'b'.repeat(64) }],
};

it('publishes simulation columns before render evaluation on the fixed update schedule', () => {
  const source = worldSetup();
  const runtime = session(source);
  const arrival = columnArrival(runtime, source);
  const phases: string[] = [];
  const original = vi.mocked(source.canonicalTerrain.terrain.generateColumn).getMockImplementation()!;
  vi.spyOn(source.canonicalTerrain.terrain, 'generateColumn').mockImplementation((x, z) => {
    phases.push('terrain');
    return original(x, z);
  });
  source.streamer.onColumn = (x, z) => {
    phases.push('publication');
    arrival.load(x, z);
  };
  source.streamer.update(0, 0);
  const budget = registry.graphics.values().next().value!.columnsPerFrame;
  expect(phases.filter((phase) => phase === 'terrain').length).toBeGreaterThan(0);
  expect(phases).toEqual([
    ...Array.from({ length: budget }, () => 'publication'),
    ...Array.from({ length: budget }, () => 'terrain'),
  ]);
  expect(
    runtime.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' }).world.rolledColumns,
  ).toHaveLength(budget);
  expect(runtime.entities.at(...crate.pos)).toBeDefined();
});

it('mirrors canonical edits to rendering without making unpublished terrain readable or changing its save', () => {
  const source = worldSetup();
  const cell = [3, 0, 3] as const;
  expect(source.world.getChunk(cx, 0, cz)).toBeUndefined();
  source.simulationWorld.setBlock(...cell, 0);
  expect(source.simulationWorld.getBlock(...cell)).toBe(NOT_LOADED);
  expect(source.world.getBlock(...cell)).toBe(0);
  expect(source.world.isTouched(cx, cz)).toBe(true);
  const saved = source.simulationWorld.snapshotColumns(String);
  expect(source.world.snapshotColumns(String)).toEqual(saved);
  source.streamer.update(0, 0);
  expect(source.simulationWorld.getBlock(...cell)).toBe(0);
  expect(source.world.getBlock(...cell)).toBe(0);
  expect(source.simulationWorld.snapshotColumns(String)).toEqual(saved);
  source.simulationWorld.unload(cx, cz);
  expect(source.simulationWorld.getBlock(...cell)).toBe(NOT_LOADED);
  source.simulationWorld.arrive(cx, cz);
  expect(source.simulationWorld.getBlock(...cell)).toBe(0);
});

it('keeps composed source furnishing inside the saved arrival gate', async () => {
  const source = worldSetup();
  const furnishing = vi.spyOn(source, 'furnitureIn');
  const runtime = session(source);
  const arrival = columnArrival(runtime, source);
  source.simulationWorld.arrive(cx, cz);
  arrival.load(cx, cz);
  expect(furnishing).toHaveBeenCalledWith(cx, cz);
  const entity = runtime.entities.at(...crate.pos)!;
  expect(entity).toBeDefined();
  expect(runtime.liftFurniture(entity.uid)).toBeUndefined();
  expect(runtime.placeFurniture([3, 1, 3])).toBeUndefined();
  expect(runtime.entities.at(...crate.pos)).toBeUndefined();
  const snapshot = runtime.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' });
  expect(snapshot.world.rolledColumns).toContain(`${cx},${cz}`);
  const bytes = await encodeSave(snapshot, {
    generation: 1,
    version,
    worldOptions: { blockSize: source.config.scale.blockSize, site: source.config.site, storeys: 1, density: null },
  });
  const decoded = await decodeSave(bytes, {
    version,
    contentLookup: (kind, id, item) => contentLookup(registry, kind, id, item),
  });
  const restoredSource = worldSetup();
  const restoredFurnishing = vi.spyOn(restoredSource, 'furnitureIn');
  const restored = session(restoredSource, decoded.snapshot);
  const returning = columnArrival(restored, restoredSource);
  restoredSource.simulationWorld.unload(cx, cz);
  returning.unload(cx, cz);
  restoredSource.simulationWorld.arrive(cx, cz);
  returning.load(cx, cz);
  expect(restoredFurnishing).not.toHaveBeenCalled();
  expect(restored.entities.at(...crate.pos)).toBeUndefined();
  expect(restored.entities.byUid(entity.uid)?.pos).toEqual(entity.pos);
});
