import { expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { Chunk } from '../src/core/chunk.ts';
import { worldOpaque, worldSolid } from '../src/core/collision.ts';
import { buildMesh } from '../src/core/mesher.ts';
import { extractPadded, extractWide } from '../src/core/meshInput.ts';
import { type Body, bodyOverlapsTerrain } from '../src/core/physics.ts';
import { raycast } from '../src/core/raycast.ts';
import { isEnclosed, World } from '../src/core/world.ts';
import { perceivePlayer } from '../src/core/zombies.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

it('keeps a wire fence solid to bodies and physical rays but open to zombie sight', () => {
  const registry = baseRegistry();
  const fence = registry.blockIds.get('chain_link')!;
  const world = new World();
  const entities = new BlockEntities(registry);
  const solid = worldSolid(world, registry, entities);
  const opaque = worldOpaque(world, registry, entities);
  const sees = () =>
    perceivePlayer({
      zombie: registry.zombies.get('shambler')!,
      from: [0.5, 2, 1.5],
      facing: [1, 0, 0],
      player: {
        pos: [5.5, 2, 1.5],
        facing: [-1, 0, 0],
        movement: 'still',
        lit: false,
        lightSeenFrom: 40,
        eyeHeightMetres: 1.3,
      },
      dayPhase: dayStateAtHour(12).phase,
      sightBlend: dayStateAtHour(12).sightBlend,
      blockSize: 0.5,
      isSolid: opaque,
      tuning: TEST_SENSE_TUNING,
    });
  const body: Body = { pos: [4.5, 2, 1], vel: [0, 0, 0], halfWidth: 0.3, halfDepth: 0.3, height: 3, onGround: false };
  expect(bodyOverlapsTerrain(body, solid)).toBe(false);
  for (let y = 0; y < 8; y++) {
    world.setBlock(4, y, 1, fence);
  }
  expect(bodyOverlapsTerrain(body, solid)).toBe(true);
  expect(raycast([0.5, 4.5, 1.5], [1, 0, 0], 10, solid)?.block).toEqual([4, 4, 1]);
  expect(raycast([0.5, 4.5, 1.5], [1, 0, 0], 10, opaque)).toBeUndefined();
  expect(sees()).toBe(true);
  for (let y = 0; y < 8; y++) {
    world.setBlock(4, y, 1, registry.blockIds.get('stone')!);
  }
  expect(sees()).toBe(false);
});

it('does not discard a chunk surrounded by uniform wire blocks as enclosed terrain', () => {
  const registry = baseRegistry();
  const fence = registry.blockIds.get('chain_link')!;
  const world = new World();
  for (const [x, y, z] of [
    [0, 0, 0],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]) {
    world.addChunk(new Chunk(x!, y!, z!, fence));
  }
  world.addChunk(new Chunk(0, 0, 0, registry.blockIds.get('stone')!));
  const occluders = Uint8Array.from(registry.blocks, (block, id) => Number(id !== 0 && !block.wireMesh));
  expect(isEnclosed(world, [0, 0, 0])).toBe(true);
  expect(isEnclosed(world, [0, 0, 0], Number.NEGATIVE_INFINITY, occluders)).toBe(false);
});

it('meshes content-selected wire holes without hiding neighbouring surfaces or adding ambient occlusion', () => {
  const registry = baseRegistry();
  const fence = registry.blockIds.get('chain_link')!;
  const world = new World();
  world.setBlock(2, 2, 2, fence);
  const wireMeshes = registry.blocks.map((block) => block.wireMesh);
  const occluders = Uint8Array.from(registry.blocks, (block, id) => Number(id !== 0 && !block.wireMesh));
  expect(extractWide(world, [0, 0, 0], Number.NEGATIVE_INFINITY, occluders).some(Boolean)).toBe(false);
  const options = { wireMeshes };
  const colors = new Uint8Array(registry.blocks.length * 3).fill(200);
  const wire = buildMesh(extractPadded(world, [0, 0, 0]), colors, options);
  // Triangle area, not a vertex count: open geometry must cover less than its enclosing cube.
  let area = 0;
  for (let i = 0; i < wire.indices.length; i += 3) {
    const vertices = [0, 1, 2].map((j) =>
      Array.from(wire.positions.slice(wire.indices[i + j]! * 3, wire.indices[i + j]! * 3 + 3)),
    );
    const a = vertices[1]!.map((v, axis) => v - vertices[0]![axis]!);
    const b = vertices[2]!.map((v, axis) => v - vertices[0]![axis]!);
    area += Math.hypot(a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!) / 2;
  }
  expect(area).toBeGreaterThan(0);
  expect(area).toBeLessThan(6);
  world.setBlock(3, 2, 2, registry.blockIds.get('stone')!);
  const mixed = buildMesh(extractPadded(world, [0, 0, 0]), colors, options);
  const wallVisibleThroughWire = Array.from(mixed.normals).some(
    (n, i) => i % 3 === 0 && n === -1 && mixed.positions[i] === 3,
  );
  expect(wallVisibleThroughWire).toBe(true);
});
