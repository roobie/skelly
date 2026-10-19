import { expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { type CompiledTemplate, cellsOf, compileAssembly, compileTemplate } from '../src/core/templates.ts';
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

it('keeps enclosed building roof voxels inside their exterior wall footprint', () => {
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
          slab.every(([x, , z]) => x >= minX && x <= maxX && z >= minZ && z <= maxZ),
          `${compiled.id}: roof outside walls`,
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
