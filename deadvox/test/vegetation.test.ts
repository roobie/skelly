import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { Chunk } from '../src/core/chunk.ts';
import { worldSolid } from '../src/core/collision.ts';
import { buildRegistry } from '../src/core/content.ts';
import { footstepEventForBlock, shamblerFootstepEventForBlock } from '../src/core/footsteps.ts';
import { Forest } from '../src/core/forest.ts';
import { HAMLET, Hamlet } from '../src/core/hamlet.ts';
import { raycast } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { grow } from '../src/core/site.ts';
import { rectsOverlap, TREE_MIX } from '../src/core/vegetation.ts';
import { World } from '../src/core/world.ts';
import { perceivePlayer } from '../src/core/zombies.ts';

const { registry, issues } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
    })),
);
const scale = makeScale(0.5);

describe('solid first-look vegetation', () => {
  it('validates content and uses the same declared solids for movement, player raycasts and zombie sight', () => {
    expect(issues).toEqual([]);
    const world = new World();
    const chunk = new Chunk(0, 0, 0);
    world.addChunk(chunk);
    const solid = worldSolid(world, registry, new BlockEntities(registry));
    const sense = () =>
      perceivePlayer({
        zombie: registry.zombies.get('shambler')!,
        from: [0, 2, 0],
        facing: [1, 0, 0],
        player: { pos: [10, 2, 0], facing: [-1, 0, 0], movement: 'still', lit: false, lightSeenFrom: 40 },
        hour: 12,
        blockSize: 0.5,
        isSolid: solid,
      });
    expect(sense()).toBe(true);
    for (const name of ['tree_trunk', 'tree_branch', 'leaves', 'hedge', 'leaf_litter']) {
      const id = registry.blockIds.get(name)!;
      expect(registry.blocks[id]!.solid, name).toBe(true);
      for (let y = 0; y < 8; y++) {
        chunk.set(4, y, 0, id);
      }
      expect(solid(4, 4, 0), name).toBe(true);
      expect(raycast([0.5, 4.5, 0.5], [1, 0, 0], 10, solid)?.block, name).toEqual([4, 4, 0]);
      expect(sense(), name).toBe(false);
    }
  });

  it('maps wood and foliage footsteps explicitly for both player and shambler', () => {
    for (const name of ['tree_trunk', 'tree_branch']) {
      expect(footstepEventForBlock(name)).toBe('footstep_wood');
      expect(shamblerFootstepEventForBlock(name)).toBe('shambler_step_wood');
    }
    for (const name of ['leaves', 'hedge', 'leaf_litter']) {
      expect(footstepEventForBlock(name)).toBe('footstep_leaves');
      expect(shamblerFootstepEventForBlock(name)).toBe('shambler_step_leaves');
    }
  });

  it('keeps entire hamlet canopies and hedges off lots, road frontage/entrances, spawn and range', () => {
    const hamlet = new Hamlet(1, registry, scale);
    expect(new Set(hamlet.trees.map((tree) => tree.shape))).toEqual(new Set(TREE_MIX));
    expect(hamlet.hedges.length).toBeGreaterThan(0);
    const required = [
      grow(hamlet.road, HAMLET.gap),
      grow(hamlet.range.rect, 4),
      ...hamlet.lots.map((lot) => grow(lot.rect, 2)),
    ];
    for (const tree of hamlet.trees) {
      expect(
        required.some((rect) => rectsOverlap(rect, tree.bounds)),
        `${tree.shape} at ${tree.origin}`,
      ).toBe(false);
    }
    for (const box of hamlet.hedges) {
      const footprint = { x0: box.min[0], z0: box.min[2], x1: box.max[0], z1: box.max[2] };
      expect(required.some((rect) => rectsOverlap(rect, footprint))).toBe(false);
      expect(hamlet.trees.some((tree) => rectsOverlap(tree.bounds, footprint))).toBe(false);
    }
    const broadleaf = hamlet.trees.find((tree) => tree.shape === 'broadleaf')!;
    expect(hamlet.surface.top!(broadleaf.origin[0], broadleaf.origin[2])).toBe(registry.blockIds.get('leaf_litter'));
    const [x, , z] = hamlet.spawn.pos;
    expect(hamlet.surface.top!(Math.floor(x / 0.5), Math.floor(z / 0.5))).toBe(registry.blockIds.get('asphalt'));
  });

  it('makes denser forests a seeded superset without moving existing trees or narrowing the extent', () => {
    const sparse = new Forest(1, registry, scale, 0.25);
    const dense = new Forest(1, registry, scale, 0.75);
    const placements = new Set(dense.trees.map((tree) => `${tree.shape}:${tree.origin}`));
    expect(sparse.trees.length).toBeGreaterThan(0);
    expect(dense.trees.length).toBeGreaterThan(sparse.trees.length * 2);
    expect(sparse.trees.every((tree) => placements.has(`${tree.shape}:${tree.origin}`))).toBe(true);
    expect(dense.bounds).toEqual(sparse.bounds);
    expect(dense.bounds).toEqual({ x0: -768, z0: -768, x1: 768, z1: 768 });
    expect(dense.trees.some((tree) => rectsOverlap(tree.bounds, { x0: -8, z0: -8, x1: 8, z1: 8 }))).toBe(false);
  });
});
