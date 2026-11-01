import { afterEach, expect, it, vi } from 'vitest';
import type { EntitySpec } from '../src/core/blockEntities.ts';
import { Chunk } from '../src/core/chunk.ts';
import { CHUNK, toChunk } from '../src/core/coords.ts';
import { decodeSave, encodeSave, SAVE_SCHEMA_VERSION } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { columnArrival } from '../src/game/columnArrival.ts';
import { configFromUrl } from '../src/game/config.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { createWorldSetup, type WorldSetup } from '../src/game/worldSetup.ts';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { startupContent } from './baseRegistry.ts';
import { fixtureBlockMaterial } from './blockMaterialFixture.ts';
import { FIXTURE_MATERIAL, fixtureBreach } from './economyFixtures.ts';

afterEach(() => vi.unstubAllGlobals());

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
  vi.stubGlobal(
    'Worker',
    class {
      postMessage = vi.fn();
    },
  );
  const config = configFromUrl(new URLSearchParams('site=testHouse'), content);
  const source = createWorldSetup(config, new ChunkMeshes(config.scale.blockSize, registry));
  const chunk = new Chunk(cx, 0, cz);
  for (let z = 0; z < CHUNK; z++) {
    for (let x = 0; x < CHUNK; x++) {
      chunk.set(x, 0, z, floor);
    }
  }
  source.world.addChunk(chunk);
  return { ...source, furnitureIn: () => [{ spec: crate, loot: [] }] };
};

const session = (source: WorldSetup, restore?: Readonly<SaveSnapshot>) =>
  createSession({
    registry,
    world: source.world,
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

it('keeps composed source furnishing inside the saved arrival gate', async () => {
  const source = worldSetup();
  const furnishing = vi.spyOn(source, 'furnitureIn');
  const runtime = session(source);
  const arrival = columnArrival(runtime, source);
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
    contentLookup: (kind, id) => contentLookup(registry, kind, id),
  });
  const restoredSource = worldSetup();
  const restoredFurnishing = vi.spyOn(restoredSource, 'furnitureIn');
  const restored = session(restoredSource, decoded.snapshot);
  const returning = columnArrival(restored, restoredSource);
  returning.unload(cx, cz);
  returning.load(cx, cz);
  expect(restoredFurnishing).not.toHaveBeenCalled();
  expect(restored.entities.at(...crate.pos)).toBeUndefined();
  expect(restored.entities.byUid(entity.uid)?.pos).toEqual(entity.pos);
});
