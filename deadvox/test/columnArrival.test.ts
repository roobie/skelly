import { describe, expect, it, vi } from 'vitest';
import type { EntitySpec } from '../src/core/blockEntities.ts';
import { Chunk } from '../src/core/chunk.ts';
import { CHUNK, toChunk } from '../src/core/coords.ts';
import type { LootSpawnPoint } from '../src/core/loot.ts';
import { decodeSave, encodeSave, SAVE_SCHEMA_VERSION } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import type { FurnitureSpawn } from '../src/core/site.ts';
import { World } from '../src/core/world.ts';
import { columnArrival } from '../src/game/columnArrival.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const crate: EntitySpec = { type: 'fixture_overlay_crate', pos: [3, 1, 1], size: [1, 1, 1], facing: 'n' };
const point: LootSpawnPoint = {
  id: 'fixture_overlay_ground',
  channel: 'ground',
  position: [1, 1, 3],
  destination: [1, 1, 3],
  context: { usage: ['Residential'], tier: 'Tier1' },
  supply: { kind: 'fixed', items: [{ item: 'fixture_overlay_stock' }] },
  required: true,
};
registry.furniture.set(crate.type, { id: crate.type, name: 'Fixture crate', size: crate.size, color: '#808080' });
registry.items.set('fixture_overlay_stock', {
  id: 'fixture_overlay_stock',
  name: 'Fixture stock',
  category: 'misc',
  weight: 1,
  size: [1, 1],
  economy: { usage: ['Residential'], tiers: ['Tier1'] },
});
const floor = registry.blocks.length;
registry.blocks.push({ id: 'fixture_floor', name: 'Fixture floor', solid: true, color: '#808080' });
registry.blockIds.set('fixture_floor', floor);
const cx = toChunk(crate.pos[0]);
const cz = toChunk(crate.pos[2]);
const overlaySource = (empty = false) => ({
  site: undefined,
  furnitureIn: vi.fn((x: number, z: number): FurnitureSpawn[] =>
    !empty && x === cx && z === cz ? [{ spec: crate, loot: [] }] : [],
  ),
  lootPointsIn: (x: number, z: number) => (!empty && x === cx && z === cz ? [point] : []),
  zombiesIn: () => [],
});
const session = (restore?: Readonly<SaveSnapshot>) => {
  const world = new World();
  const chunk = new Chunk(cx, 0, cz);
  for (let z = 0; z < CHUNK; z++) {
    for (let x = 0; x < CHUNK; x++) {
      chunk.set(x, 0, z, floor);
    }
  }
  world.addChunk(chunk);
  return createSession({
    registry,
    world,
    isSolid: (_x, y) => y < 1,
    isOpaque: () => false,
    scale: makeScale(0.5),
    seed: 7,
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
};
const version = {
  simulationHash: 'a'.repeat(64),
  schemaVersion: SAVE_SCHEMA_VERSION,
  generators: {},
  contentPacks: [{ id: 'fixture', version: '1', canonicalHash: 'b'.repeat(64) }],
};

describe('column arrival', () => {
  it('keeps site-less overlay supply spent after moving furniture, saving and returning', async () => {
    const overlay = overlaySource();
    expect(overlay.site).toBeUndefined();
    const runtime = session();
    const arrival = columnArrival(runtime, overlay);
    arrival.load(cx, cz);
    expect(overlay.furnitureIn).toHaveBeenCalledWith(cx, cz);
    const entity = runtime.entities.at(...crate.pos)!;
    expect(entity).toBeDefined();
    expect(runtime.liftFurniture(entity.uid)).toBeUndefined();
    expect(runtime.placeFurniture([3, 1, 3])).toBeUndefined();
    expect(runtime.entities.at(...crate.pos)).toBeUndefined();
    const pile = runtime.inventory.piles.get(point.destination.join(','));
    expect(pile).toBeDefined();
    const { item } = pile!.items[0]!;
    expect(runtime.inventory.move(item, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(runtime.inventory.piles.has(point.destination.join(','))).toBe(false);
    const snapshot = runtime.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' });
    expect(snapshot.world.rolledColumns).toContain(`${cx},${cz}`);
    const bytes = await encodeSave(snapshot, {
      generation: 1,
      version,
      worldOptions: { blockSize: 0.5, site: 'testHouse', storeys: 1, density: null },
    });
    const decoded = await decodeSave(bytes, {
      version,
      contentLookup: (kind, id) => contentLookup(registry, kind, id),
    });
    const restored = session(decoded.snapshot);
    const returning = columnArrival(restored, overlay);
    overlay.furnitureIn.mockClear();
    returning.unload(cx, cz);
    returning.load(cx, cz);
    expect(overlay.furnitureIn).not.toHaveBeenCalled();
    expect(restored.entities.at(...crate.pos)).toBeUndefined();
    expect(restored.entities.byUid(entity.uid)?.pos).toEqual(entity.pos);
    expect(restored.inventory.piles.has(point.destination.join(','))).toBe(false);
    expect(restored.inventory.hands.right?.uid).toBe(item.uid);
  });

  it('marks an empty site-less arrival and does not enumerate it again', () => {
    const overlay = overlaySource(true);
    const runtime = session();
    const arrival = columnArrival(runtime, overlay);
    arrival.load(cx, cz);
    expect(overlay.furnitureIn).toHaveBeenCalledWith(cx, cz);
    expect(
      runtime.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' }).world.rolledColumns,
    ).toContain(`${cx},${cz}`);
    overlay.furnitureIn.mockClear();
    arrival.unload(cx, cz);
    arrival.load(cx, cz);
    expect(overlay.furnitureIn).not.toHaveBeenCalled();
  });
});
