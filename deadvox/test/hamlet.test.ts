import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { CHUNK, toChunk } from '../src/core/coords.ts';
import { HAMLET, HAMLET_TEMPLATES, Hamlet, hamletZombieSpawns } from '../src/core/hamlet.ts';
import { rollLoot } from '../src/core/loot.ts';
import { Rng } from '../src/core/random.ts';
import { makeScale } from '../src/core/scale.ts';
import { cellsOf } from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { generateColumn, type Terrain } from '../src/core/worldgen.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ source: f, data: JSON.parse(readFileSync(join(BASE, f), 'utf8')) as unknown })),
);
const scale = makeScale(0.5);
const id = (name: string) => registry.blockIds.get(name)!;

/** Generates every column the hamlet touches, in the given order, into a fresh world. */
const generate = (hamlet: Hamlet, seed: number, columns: [number, number][]) => {
  const terrain: Terrain = {
    seed,
    scale,
    blocks: { grass: id('grass'), dirt: id('dirt'), stone: id('stone'), sand: id('sand') },
    surface: hamlet.surface,
    stamp: (chunk) => hamlet.stamp(chunk),
  };
  const world = new World();
  const furniture: string[] = [];
  for (const [cx, cz] of columns) {
    for (const chunk of generateColumn(terrain, cx, cz)) {
      world.addChunk(chunk);
    }
    furniture.push(...hamlet.furnitureIn(cx, cz).map((f) => JSON.stringify(f)));
  }
  return { world, furniture: furniture.sort() };
};

const columnsOf = (hamlet: Hamlet): [number, number][] => {
  const out: [number, number][] = [];
  const { x0, z0, x1, z1 } = hamlet.bounds;
  for (let cz = toChunk(z0); cz <= toChunk(z1 - 1); cz++) {
    for (let cx = toChunk(x0); cx <= toChunk(x1 - 1); cx++) {
      out.push([cx, cz]);
    }
  }
  return out;
};

/** Keys of chunks whose blocks differ between two worlds (comparing bytes; toEqual on typed arrays is slow). */
const differing = (a: World, b: World): string[] =>
  [...a.chunks]
    .filter(([key, chunk]) => {
      const other = b.chunks.get(key);
      return !(other && Buffer.from(other.toArray().buffer).equals(Buffer.from(chunk.toArray().buffer)));
    })
    .map(([key]) => key);

const shuffled = <T>(items: T[], seed: number): T[] => {
  const rng = Rng.stream(seed, 'test-order');
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

describe('the hamlet', () => {
  for (const seed of [1, 7]) {
    // Heavy property test over random chunk orders; coverage is the point, so it stays full; 30s absorbs CI parallelism (#29).
    it(`generates the same in any chunk order (seed ${seed})`, () => {
      const columns = columnsOf(new Hamlet(seed, registry, scale));
      // A fresh Hamlet for each run: nothing may carry over between them.
      const a = generate(new Hamlet(seed, registry, scale), seed, columns);
      const b = generate(new Hamlet(seed, registry, scale), seed, shuffled(columns, seed));
      const c = generate(new Hamlet(seed, registry, scale), seed, [...columns].reverse());
      expect(b.world.chunks.size).toBe(a.world.chunks.size);
      expect(differing(a.world, b.world)).toEqual([]);
      expect(differing(a.world, c.world)).toEqual([]);
      expect(b.furniture).toEqual(a.furniture);
      expect(c.furniture).toEqual(a.furniture);
      const canopy = new Hamlet(seed, registry, scale).trees.find(
        (tree) => toChunk(tree.bounds.x0) !== toChunk(tree.bounds.x1 - 1),
      );
      expect(canopy, 'seeded tree canopy must cross a chunk boundary').toBeDefined();
      const cut = (toChunk(canopy!.bounds.x0) + 1) * CHUNK;
      const leaf = id('leaves');
      for (const x of [cut - 1, cut]) {
        const containsLeaf = canopy!.boxes
          .filter((box) => box.block === leaf && box.min[0] <= x && box.max[0] > x)
          .some((box) => a.world.getBlock(x, box.min[1], box.min[2]) === leaf);
        expect(containsLeaf, `leaf voxels on boundary side x=${x}`).toBe(true);
      }
    }, 30_000);
  }

  it('places every hamlet template on a flat lot beside an asphalt road', () => {
    const hamlet = new Hamlet(3, registry, scale);
    const columns = columnsOf(hamlet);
    const spawns = columns.flatMap(([cx, cz]) => hamlet.zombiesIn(cx, cz));
    expect(spawns.length).toBeGreaterThanOrEqual(6);
    expect(spawns.length).toBeLessThanOrEqual(10);
    const { world } = generate(hamlet, 3, columns);
    expect(new Set(hamlet.lots.map((lot) => lot.placement.template.id))).toEqual(new Set(HAMLET_TEMPLATES));
    const top = (x: number, z: number) => {
      let y = 200;
      while (y > -100 && world.getBlock(x, y, z) === 0) {
        y -= 1;
      }
      return y;
    };
    for (const lot of hamlet.lots) {
      // The padding around the building is lot ground at the floor's height.
      const { x0, z0 } = lot.rect;
      expect(top(x0, z0)).toBe(lot.floor);
      expect(world.getBlock(x0, lot.floor, z0)).toBe(id('grass'));
    }
    const { road } = hamlet;
    const midX = Math.floor((road.x0 + road.x1) / 2);
    const midZ = Math.floor((road.z0 + road.z1) / 2);
    expect(world.getBlock(midX, top(midX, midZ), midZ)).toBe(id('asphalt'));
    // The player starts on the road.
    const [sx, sy, sz] = hamlet.spawn.pos.map((m) => m / scale.blockSize);
    expect(world.getBlock(Math.floor(sx!), Math.floor(sy!) - 1, Math.floor(sz!))).toBe(id('asphalt'));
  });

  it('adds a deterministic handling range beside the hamlet, without a new site', () => {
    const hamlet = new Hamlet(13, registry, scale);
    const other = new Hamlet(13, registry, scale);
    const nearestHamletEdge = Math.max(hamlet.road.x1, ...hamlet.lots.map((lot) => lot.rect.x1));
    expect(hamlet.range.rect.x0).toBeGreaterThan(nearestHamletEdge);
    expect(hamlet.range.rect).toEqual(other.range.rect);
    expect(hamlet.range.targetXs).toEqual(other.range.targetXs);

    const columns = columnsOf(hamlet);
    const { world, furniture } = generate(hamlet, 13, columns);
    const line = hamlet.range.firingLine;
    const lineZ = Math.floor((line.z0 + line.z1) / 2);
    expect(world.getBlock(line.x0, hamlet.range.floor, lineZ)).toBe(id('asphalt'));
    expect(world.getBlock(hamlet.range.targetXs[0]!, hamlet.range.floor + 2, lineZ)).not.toBe(0);
    expect(furniture.some((entry) => entry.includes(JSON.stringify(hamlet.range.table)))).toBe(true);
    expect(
      hamlet.range.furnitureIn(toChunk(hamlet.range.table.pos[0]), toChunk(hamlet.range.table.pos[2]))[0]?.spec,
    ).toEqual(hamlet.range.table);
    expect(hamlet.surface.height(line.x0, lineZ, -999)).toBe(hamlet.range.floor);
  });

  it('puts furniture in air, standing on something, and doors in walls', () => {
    const hamlet = new Hamlet(3, registry, scale);
    const columns = columnsOf(hamlet);
    const { world } = generate(hamlet, 3, columns);
    const pieces = columns.flatMap(([cx, cz]) => hamlet.furnitureIn(cx, cz));
    expect(pieces.length).toBeGreaterThan(0);
    for (const { spec } of pieces) {
      const [x0, y0, z0] = spec.pos;
      const filled = [...cellsOf(spec.size)]
        .map(([x, y, z]) => [x0 + x, y0 + y, z0 + z] as const)
        .filter(([x, y, z]) => world.getBlock(x, y, z) !== 0);
      expect(filled, spec.type).toEqual([]);
      expect(world.getBlock(x0, y0 - 1, z0), `${spec.type} floor`).not.toBe(0);
      if (registry.furniture.get(spec.type)!.door) {
        // Wall above the doorway.
        expect(world.getBlock(x0, y0 + spec.size[1], z0), `${spec.type} lintel`).not.toBe(0);
      }
    }
  });

  it('rolls loot into containers, the same for the same place', () => {
    const hamlet = new Hamlet(5, registry, scale);
    const pieces = columnsOf(hamlet).flatMap(([cx, cz]) => hamlet.furnitureIn(cx, cz));
    expect(pieces.some((piece) => registry.furniture.get(piece.spec.type)?.container !== undefined)).toBe(true);
    const again = columnsOf(hamlet).flatMap(([cx, cz]) => new Hamlet(5, registry, scale).furnitureIn(cx, cz));
    expect(again).toEqual(pieces);
  });

  it('spawns six to ten deterministic shamblers across twenty seeds', () => {
    const road = { x0: 0, z0: 0, x1: 64, z1: 12 };
    for (let seed = 1; seed <= 20; seed++) {
      const spawns = hamletZombieSpawns(seed, road, [], () => 10);
      expect(spawns.length, `seed ${seed}`).toBeGreaterThanOrEqual(6);
      expect(spawns.length, `seed ${seed}`).toBeLessThanOrEqual(10);
      expect(hamletZombieSpawns(seed, road, [], () => 10)).toEqual(spawns);
    }
  });

  it('keeps lots and the road far enough apart to stay flat', () => {
    // Flattening reaches `blend` blocks out; lots and the road are `gap` apart.
    expect(HAMLET.blend).toBeLessThanOrEqual(HAMLET.gap);
  });
});

describe('loot', () => {
  it('is the same for the same stream and stays within the table', () => {
    const a = rollLoot(registry, 'kitchen_cupboard', Rng.stream(9, 'x'));
    const b = rollLoot(registry, 'kitchen_cupboard', Rng.stream(9, 'x'));
    expect(a).toEqual(b);
    for (let i = 0; i < 200; i++) {
      for (const item of rollLoot(registry, 'junk', Rng.stream(i, 'junk'))) {
        const def = registry.items.get(item.type)!;
        expect(item.count).toBeLessThanOrEqual(def.stack ?? 1);
        expect(item.condition).toBeGreaterThanOrEqual(0);
        expect(item.condition).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rolls nested tables', () => {
    const types = new Set<string>();
    for (let i = 0; i < 300; i++) {
      for (const item of rollLoot(registry, 'kitchen_cupboard', Rng.stream(i, 'k'))) {
        types.add(item.type);
      }
    }
    // kitchen_tools is only reachable through a nested table.
    expect([...types].some((t) => ['kitchen_knife', 'can_opener', 'lighter', 'matches'].includes(t))).toBe(true);
  });
});
