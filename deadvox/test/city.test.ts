import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CITY, StressCity } from '../src/core/city.ts';
import { buildRegistry } from '../src/core/content.ts';
import { makeScale } from '../src/core/scale.ts';
import { compileTemplate, stackTemplate } from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { generateColumn, type Terrain } from '../src/core/worldgen.ts';
import { siteFromUrl } from '../src/game/config.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ source: f, data: JSON.parse(readFileSync(join(BASE, f), 'utf8')) as unknown })),
);
const scale = makeScale(0.5);
const id = (name: string) => registry.blockIds.get(name)!;

const generate = (city: StressCity, columns: [number, number][]) => {
  const terrain: Terrain = {
    seed: 2,
    scale,
    blocks: { grass: id('grass'), dirt: id('dirt'), stone: id('stone'), sand: id('sand') },
    surface: city.surface,
    stamp: (chunk) => city.stamp(chunk),
  };
  const world = new World();
  const furniture: string[] = [];
  for (const [cx, cz] of columns) {
    for (const chunk of generateColumn(terrain, cx, cz)) {
      world.addChunk(chunk);
    }
    furniture.push(...city.furnitureIn(cx, cz).map((f) => JSON.stringify(f)));
  }
  return { world, furniture: furniture.sort() };
};

/** A window of columns around the origin. */
const window: [number, number][] = [];
for (let cz = -3; cz < 3; cz++) {
  for (let cx = -3; cx < 3; cx++) {
    window.push([cx, cz]);
  }
}

describe('the stress-test city', () => {
  it('fills its blocks with buildings, and spawns on a street', () => {
    const city = new StressCity(2, registry, scale);
    expect(city.placements.length).toBeGreaterThan(200);
    const [x, , z] = city.spawn.pos.map((m) => m / scale.blockSize);
    expect(city.surface.top(Math.floor(x!), Math.floor(z!))).toBe(id('asphalt'));
    expect(city.bounds.x1 - city.bounds.x0).toBeGreaterThanOrEqual(2 * CITY.reach);
  });

  it('generates the same in any chunk order', () => {
    const city = new StressCity(2, registry, scale, 4);
    const a = generate(city, window);
    const b = generate(new StressCity(2, registry, scale, 4), [...window].reverse());
    for (const [key, chunk] of a.world.chunks) {
      const other = b.world.chunks.get(key)!;
      expect(Buffer.from(other.toArray().buffer).equals(Buffer.from(chunk.toArray().buffer)), key).toBe(true);
    }
    expect(b.furniture).toEqual(a.furniture);
    expect(a.furniture.length).toBeGreaterThan(0);
  });

  it('stacks storeys for taller buildings', () => {
    const house = compileTemplate(registry, registry.templates.get('small_house')!);
    const tall = stackTemplate(house, 3);
    const [, sy] = house.size;
    expect(tall.size[1]).toBe(1 + 3 * (sy - 1));
    expect(tall.pieces).toHaveLength(3 * house.pieces.length);
    expect(stackTemplate(house, 1)).toBe(house);
    const city = new StressCity(2, registry, scale, 5);
    const heights = new Set(city.placements.map((p) => p.template.size[1]));
    expect(heights.size).toBeGreaterThan(2);
  });

  it('is chosen from the URL', () => {
    expect(siteFromUrl(new URLSearchParams(''), 'hamlet')).toEqual({ site: 'hamlet', storeys: 1 });
    expect(siteFromUrl(new URLSearchParams('site=city&storeys=6'), 'testHouse')).toEqual({ site: 'city', storeys: 6 });
    expect(siteFromUrl(new URLSearchParams('site=city&storeys=99'), 'hamlet')).toEqual({ site: 'city', storeys: 1 });
  });
});
