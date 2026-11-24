import {
  type CompiledTemplate,
  cellsOf,
  compileAssembly,
  compileTemplate,
} from '@skelly/engine/internal/core/templates.ts';
import type { Vec3 } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { startupContent } from './baseRegistry.ts';

const { registry } = startupContent();
const blockAt = (template: CompiledTemplate, [x, y, z]: Vec3) =>
  template.blocks[x + template.size[0] * (z + template.size[2] * y)]!;
const solidCells = (template: CompiledTemplate) =>
  [...cellsOf(template.size)].filter((cell) => registry.blocks[blockAt(template, cell)]?.solid);

const roofIslands = (cells: Vec3[]): Vec3[][] => {
  const remaining = new Map(cells.map((cell) => [cell.join(','), cell]));
  const islands: Vec3[][] = [];
  while (remaining.size > 0) {
    const pending = [remaining.values().next().value!];
    remaining.delete(pending[0]!.join(','));
    const island: Vec3[] = [];
    while (pending.length > 0) {
      const cell = pending.pop()!;
      island.push(cell);
      const [x, y, z] = cell;
      const neighbors: Vec3[] = [
        [x - 1, y, z],
        [x + 1, y, z],
        [x, y, z - 1],
        [x, y, z + 1],
        [x, y - 1, z],
        [x, y + 1, z],
      ];
      for (const neighbor of neighbors) {
        if (remaining.delete(neighbor.join(','))) {
          pending.push(neighbor);
        }
      }
    }
    islands.push(island);
  }
  return islands;
};

const buildingsWithRoofs = () => {
  const roofMaterials = new Set(['roof', 'galvanized'].map((id) => registry.blockIds.get(id)!));
  const buildings: { compiled: CompiledTemplate; roofCells?: Vec3[] }[] = [];
  for (const template of registry.templates.values()) {
    const compiled = compileTemplate(registry, template);
    const solid = solidCells(compiled);
    const wallTop = solid.reduce(
      (height, cell) => (roofMaterials.has(blockAt(compiled, cell)) ? height : Math.max(height, cell[1])),
      Number.NEGATIVE_INFINITY,
    );
    const roofCells = solid.filter((cell) => cell[1] > wallTop && roofMaterials.has(blockAt(compiled, cell)));
    if (roofCells.length > 0) {
      buildings.push({ compiled, roofCells });
    }
  }
  for (const assembly of registry.mapAssemblies.values()) {
    if (assembly.access) {
      buildings.push({ compiled: compileAssembly(registry, assembly, { seed: 1, siteId: 'roof_witness' }) });
    }
  }
  return buildings;
};

// A roof may run one block past its walls as a cornice, no further.
const CORNICE = 1;

it('keeps enclosed building roof voxels within one cornice block of their exterior wall footprint', () => {
  const buildings = buildingsWithRoofs();
  expect(buildings.length).toBeGreaterThan(0);
  let checked = 0;
  for (const { compiled, roofCells } of buildings) {
    const solid = solidCells(compiled);
    const doors = compiled.pieces
      .filter((piece) => registry.furniture.get(piece.furniture)?.door)
      .flatMap((piece) =>
        [...cellsOf(piece.size)].map(([x, y, z]) => [x + piece.pos[0], y + piece.pos[1], z + piece.pos[2]] as Vec3),
      );
    let enclosures = 0;
    const courses = [...new Set(solid.map(([, y]) => y))].sort((a, b) => b - a);
    const slabs = roofCells ? roofIslands(roofCells) : courses.map((height) => solid.filter(([, y]) => y === height));
    for (const slab of slabs) {
      const underside = Math.min(...slab.map(([, y]) => y));
      const projection = new Set(slab.map(([x, , z]) => `${x},${z}`));
      const walls = [...solid, ...doors].filter(([x, y, z]) => y === underside - 1 && projection.has(`${x},${z}`));
      const minX = Math.min(...walls.map(([x]) => x));
      const maxX = Math.max(...walls.map(([x]) => x));
      const minZ = Math.min(...walls.map(([, , z]) => z));
      const maxZ = Math.max(...walls.map(([, , z]) => z));
      const wallCells = new Set(walls.map(([x, , z]) => `${x},${z}`));
      // The open forecourt canopy stands on poles, not an enclosing wall footprint.
      const alongX = Array.from({ length: maxX - minX + 1 }, (_, i) => minX + i);
      const alongZ = Array.from({ length: maxZ - minZ + 1 }, (_, i) => minZ + i);
      const hasWall =
        alongX.length > 1 &&
        alongZ.length > 1 &&
        ([minZ, maxZ].some((z) => alongX.every((x) => wallCells.has(`${x},${z}`))) ||
          [minX, maxX].some((x) => alongZ.every((z) => wallCells.has(`${x},${z}`))));
      if (!hasWall) {
        continue;
      }
      enclosures += 1;
      expect
        .soft(
          slab.every(
            ([x, , z]) => x >= minX - CORNICE && x <= maxX + CORNICE && z >= minZ - CORNICE && z <= maxZ + CORNICE,
          ),
          `${compiled.id}: roof beyond a cornice outside walls`,
        )
        .toBe(true);
      if (!roofCells) {
        break;
      }
    }
    if (!roofCells) {
      expect(enclosures, `${compiled.id}: an enclosed building was checked`).toBeGreaterThan(0);
    }
    checked += enclosures;
  }
  expect(checked).toBeGreaterThan(0);
});

/** The highest solid cell of each column strictly inside the walls standing on the entrance course. */
const topsInsideWalls = (compiled: CompiledTemplate, wallCourse: number): Map<string, Vec3> => {
  const solid = solidCells(compiled);
  const walls = solid.filter(([, y]) => y === wallCourse);
  const xs = walls.map(([x]) => x);
  const zs = walls.map(([, , z]) => z);
  const inside = ([x, , z]: Vec3) =>
    x > Math.min(...xs) && x < Math.max(...xs) && z > Math.min(...zs) && z < Math.max(...zs);
  const tops = new Map<string, Vec3>();
  for (const cell of solid.filter(inside)) {
    const key = `${cell[0]},${cell[2]}`;
    if (cell[1] > (tops.get(key)?.[1] ?? -1)) {
      tops.set(key, cell);
    }
  }
  return tops;
};

/** Roof covering excludes lower floors exposed by a breach, and columns a chimney rises through. */
const roofCovering = (compiled: CompiledTemplate, wallCourse: number, roofBase: number): Set<number> => {
  const tops = topsInsideWalls(compiled, wallCourse);
  for (const [column, cell] of tops) {
    if (cell[1] < roofBase) {
      tops.delete(column);
    }
  }
  for (const piece of compiled.pieces) {
    for (const [x, y, z] of cellsOf(piece.size)) {
      const key = `${x + piece.pos[0]},${z + piece.pos[2]}`;
      if (y + piece.pos[1] > (tops.get(key)?.[1] ?? Number.POSITIVE_INFINITY)) {
        tops.delete(key);
      }
    }
  }
  return new Set([...tops.values()].map((cell) => blockAt(compiled, cell)));
};

it('covers every roof of a briefed building with one course of a roof-role material', () => {
  const roofing = new Set(
    [...registry.mapStyles.values()].flatMap((style) =>
      Object.values(style.bindings).flatMap(({ role, block }) =>
        role === 'roof' ? [registry.blockIds.get(block)!] : [],
      ),
    ),
  );
  const briefed = [...registry.mapAssemblies.values()].filter((assembly) => assembly.access && assembly.brief);
  const topSlot = (assembly: (typeof briefed)[number]) =>
    assembly.slots.find((slot) => slot.at[1] + slot.size[1] === assembly.size[1]);
  // A plot's top slot is a briefed building of its own, whose roof is proven where that building is briefed.
  const nestsBriefed = (assembly: (typeof briefed)[number]) => {
    const choices = topSlot(assembly)?.choices ?? [];
    return (
      choices.length > 0 &&
      choices.every(({ ref }) => ref.kind === 'assembly' && registry.mapAssemblies.get(ref.id)?.brief !== undefined)
    );
  };
  const buildings = briefed.filter((assembly) => !nestsBriefed(assembly));
  expect(buildings.length).toBeGreaterThan(0);
  for (const assembly of buildings) {
    const roofSlot = topSlot(assembly);
    expect(roofSlot?.choices, `${assembly.id}: an inline roof slot reaches the top`).toBeDefined();
    for (const choice of roofSlot?.choices ?? []) {
      const only = {
        ...assembly,
        slots: assembly.slots.map((slot) => (slot === roofSlot ? { ...slot, choices: [choice] } : slot)),
      };
      const compiled = compileAssembly(registry, only, { seed: 1, siteId: 'roof_witness' });
      const covering = roofCovering(compiled, assembly.access!.entrance[1], roofSlot!.at[1]);
      const label = `${assembly.id} with ${JSON.stringify(choice.ref)}`;
      expect.soft(covering.size, `${label}: one covering block`).toBe(1);
      expect
        .soft(
          [...covering].every((block) => roofing.has(block)),
          `${label}: a roof-role block`,
        )
        .toBe(true);
    }
  }
});
