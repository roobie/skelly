import { describe, expect, it } from 'vitest';
import { CHUNK, type Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { cellsOf, footprint } from '../src/core/templates.ts';
import { vehicleCells } from '../src/core/vehicleProjection.ts';
import { baseRegistry } from './baseRegistry.ts';
import { testHouseSite } from './testHouseSite.ts';

const registry = baseRegistry();
const { layout, s, site, at, solid, furniture, insideLot, walkable } = testHouseSite(registry);
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

const furnitureCells = new Set(
  furniture.flatMap(({ spec }) =>
    [...cellsOf(spec.size)].map(([dx, dy, dz]) => [spec.pos[0] + dx, spec.pos[1] + dy, spec.pos[2] + dz].join()),
  ),
);
const blocked = (cell: Vec3) => solid(...cell) || furnitureCells.has(cell.join());
const buildingAt = ([x, , z]: Vec3) =>
  site.placements.find((placement) => {
    const [width, depth] = footprint(placement);
    const [ox, , oz] = placement.origin;
    return x >= ox && x < ox + width && z >= oz && z < oz + depth;
  });
const bayCells = (blueprint: string, bay: NonNullable<typeof layout.bays>[number]): Vec3[] => {
  const inventory = new Inventory(registry);
  const origin = bay.position.map((value) => value / s) as Vec3;
  inventory.registerVehicle({ blueprint, placementKey: 'fixture.bay', origin, facing: bay.facing });
  return [...vehicleCells(registry, inventory.vehicles, s)];
};
/** Slides the vehicle along its length, one way, until it stands clear of its building or touches something. */
const leaves = (cells: readonly Vec3[], direction: 1 | -1): boolean => {
  const building = buildingAt(cells[0]!);
  const span = (dimension: number) =>
    Math.max(...cells.map((cell) => cell[dimension]!)) - Math.min(...cells.map((cell) => cell[dimension]!));
  const axis = span(0) > span(2) ? 0 : 2;
  for (let step = 0; ; step += 1) {
    const moved = cells.map((cell): Vec3 => {
      const next: Vec3 = [...cell];
      next[axis] += step * direction;
      return next;
    });
    if (moved.some(blocked)) {
      return false;
    }
    if (moved.every((cell) => buildingAt(cell) !== building)) {
      return true;
    }
  }
};

describe('authored test house', () => {
  it('lets every parked blueprint drive out of every bay without touching the building', () => {
    const blueprints = new Set((layout.vehicles ?? []).map(({ blueprint }) => blueprint));
    expect(layout.bays?.length).toBeGreaterThan(0);
    expect(blueprints.size).toBeGreaterThan(0);
    for (const bay of layout.bays ?? []) {
      for (const blueprint of blueprints) {
        const cells = bayCells(blueprint, bay);
        expect(buildingAt(cells[0]!), `bay at ${bay.position} is under a roof`).toBeDefined();
        expect(leaves(cells, 1) || leaves(cells, -1), `${blueprint} leaves the bay at ${bay.position}`).toBe(true);
      }
    }
  });

  it('keeps a bay free of parked vehicles for part work', () => {
    const parked = new Set((layout.vehicles ?? []).map(({ position }) => position.join()));
    expect((layout.bays ?? []).some(({ position }) => !parked.has(position.join()))).toBe(true);
  });

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
    const climbable = new Set(
      furniture
        .filter(({ spec }) => registry.furniture.get(spec.type)?.climbable)
        .flatMap(({ spec }) =>
          [...cellsOf(spec.size)].map(([dx, dy, dz]) => [spec.pos[0] + dx, spec.pos[1] + dy, spec.pos[2] + dz].join()),
        ),
    );
    for (const { spec } of furniture) {
      for (const [dx, dy, dz] of cellsOf(spec.size)) {
        const cell: Vec3 = [spec.pos[0] + dx, spec.pos[1] + dy, spec.pos[2] + dz];
        expect(occupied.has(cell.join()), `overlap at ${cell}`).toBe(false);
        occupied.add(cell.join());
        expect(solid(...cell), `structure at ${cell}`).toBe(false);
      }
      const def = registry.furniture.get(spec.type)!;
      for (const [dx, , dz] of cellsOf([spec.size[0], 1, spec.size[2]])) {
        const x = spec.pos[0] + dx;
        const z = spec.pos[2] + dz;
        // A ladder stacks on its own lower piece, and a non-solid fixture may hang from the structure above it.
        const stacked = def.climbable && climbable.has([x, spec.pos[1] - 1, z].join());
        const hung = def.solid === false && solid(x, spec.pos[1] + spec.size[1], z);
        expect(solid(x, spec.pos[1] - 1, z) || stacked || hung, `${spec.type} unsupported at ${x},${z}`).toBe(true);
      }
    }
  });

  it('tops every ladder with a surface to step onto, away from its climbing side', () => {
    const away = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] } as const;
    const ladders = furniture.filter(({ spec }) => registry.furniture.get(spec.type)?.climbable);
    expect(ladders.length).toBeGreaterThan(0);
    const tops = ladders.filter(
      ({ spec }) =>
        !ladders.some(({ spec: other }) => other.pos.join() === [spec.pos[0], spec.pos[1] + 1, spec.pos[2]].join()),
    );
    for (const { spec } of tops) {
      const [wx, wz] = away[spec.facing];
      for (const [dx, , dz] of cellsOf([spec.size[0], 1, spec.size[2]])) {
        const step: Vec3 = [spec.pos[0] + dx + wx, spec.pos[1] + 1, spec.pos[2] + dz + wz];
        expect(walkable(...step), `ladder top steps onto ${step}`).toBe(true);
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
