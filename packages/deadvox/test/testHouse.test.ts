import { describe, expect, it } from 'vitest';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { CHUNK, type Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { sitePalette, terrainShapeOf } from '../src/core/sitePalette.ts';
import { cellsOf } from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { generateColumn } from '../src/core/worldgen.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const layout = registry.layouts.get('testHouse')!;
const scale = makeScale(0.5);
const s = scale.blockSize;
const site = new AuthoredSite(7, registry, scale, layout);
const world = new World();
const columns = new Set<string>();
const at = (x: number, y: number, z: number): number => {
  const cx = Math.floor(x / CHUNK);
  const cz = Math.floor(z / CHUNK);
  const key = `${cx},${cz}`;
  if (!columns.has(key)) {
    for (const chunk of generateColumn(
      {
        seed: site.seed,
        scale,
        shape: terrainShapeOf(registry),
        blocks: sitePalette(registry).terrain,
        surface: site.surface,
        stamp: (target) => site.stamp(target),
      },
      cx,
      cz,
    )) {
      world.addChunk(chunk);
    }
    columns.add(key);
  }
  return world.getBlock(x, y, z);
};
const solid = (x: number, y: number, z: number) => registry.blocks[at(x, y, z)]!.solid;
const furniture: ReturnType<AuthoredSite['furnitureIn']> = [];
const span = CHUNK * s;
for (let cx = Math.floor(layout.bounds.x0 / span); cx <= Math.floor(layout.bounds.x1 / span); cx++) {
  for (let cz = Math.floor(layout.bounds.z0 / span); cz <= Math.floor(layout.bounds.z1 / span); cz++) {
    furniture.push(...site.furnitureIn(cx, cz));
  }
}
const insideLot = ([x, , z]: Vec3) =>
  x * s >= layout.bounds.x0 && x * s < layout.bounds.x1 && z * s >= layout.bounds.z0 && z * s < layout.bounds.z1;
const walkable = (x: number, y: number, z: number) =>
  solid(x, y - 1, z) && [0, 1, 2, 3].every((dy) => !solid(x, y + dy, z));
const reachable = (start: Vec3): Vec3[] => {
  const queue = [start];
  const visited = new Set([start.join()]);
  for (const [x, y, z] of queue) {
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      for (const dy of [-1, 0, 1]) {
        const next: Vec3 = [x + dx!, y + dy, z + dz!];
        if (!insideLot(next) || visited.has(next.join()) || !walkable(...next)) {
          continue;
        }
        visited.add(next.join());
        queue.push(next);
      }
    }
  }
  return queue;
};
const roof = registry.blockIds.get('roof')!;
const home = site.placements.find(({ template }) => template.blocks.includes(roof))!;
const roofCells = [...cellsOf(home.template.size)]
  .map(([x, y, z]): Vec3 => [home.origin[0] + x, home.origin[1] + y, home.origin[2] + z])
  .filter((cell) => at(...cell) === roof);

describe('authored test house', () => {
  it('keeps normal-mode authored container sources outside world loot supply', () => {
    const points = furniture.flatMap(({ spec }) =>
      site.lootPointsIn(Math.floor(spec.pos[0] / CHUNK), Math.floor(spec.pos[2] / CHUNK)),
    );
    expect(points.length).toBeGreaterThan(0);
    expect(points.every(({ fixture }) => fixture === true)).toBe(true);
  });

  it('keeps furniture clear, supported and disjoint', () => {
    expect(furniture.length).toBeGreaterThan(0);
    const occupied = new Set<string>();
    for (const { spec } of furniture) {
      for (const [dx, dy, dz] of cellsOf(spec.size)) {
        const cell: Vec3 = [spec.pos[0] + dx, spec.pos[1] + dy, spec.pos[2] + dz];
        expect(occupied.has(cell.join()), `overlap at ${cell}`).toBe(false);
        occupied.add(cell.join());
        expect(solid(...cell), `structure at ${cell}`).toBe(false);
      }
      for (const [dx, , dz] of cellsOf([spec.size[0], 1, spec.size[2]])) {
        const x = spec.pos[0] + dx;
        const z = spec.pos[2] + dz;
        expect(solid(x, spec.pos[1] - 1, z)).toBe(true);
      }
    }
  });

  it('encloses the home beneath the roof perimeter', () => {
    expect(roofCells.length).toBeGreaterThan(0);
    const x0 = Math.min(...roofCells.map(([x]) => x));
    const x1 = Math.max(...roofCells.map(([x]) => x));
    const z0 = Math.min(...roofCells.map(([, , z]) => z));
    const z1 = Math.max(...roofCells.map(([, , z]) => z));
    const wallTop = Math.min(...roofCells.map(([, y]) => y)) - 1;
    for (const [x, , z] of roofCells) {
      if (x === x0 || x === x1 || z === z0 || z === z1) {
        expect(solid(x, wallTop, z), `wall beneath roof at ${x},${z}`).toBe(true);
      }
    }
  });

  it('starts on walkable ground inside the lot and reaches the interior and roof by steps', () => {
    const start = site.spawn.pos.map((value) => Math.floor(value / s)) as Vec3;
    expect(insideLot(start)).toBe(true);
    expect(walkable(...start)).toBe(true);
    const reached = reachable(start);
    expect(reached.some(([x, y, z]) => at(x, y - 1, z) === roof)).toBe(true);
    const [ox, oy, oz] = home.origin;
    const [width, , depth] = home.template.size;
    expect(
      reached.some(([x, y, z]) => y === oy + 1 && x > ox && x < ox + width - 1 && z > oz + 1 && z < oz + depth - 1),
    ).toBe(true);
  });
});
