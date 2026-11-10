import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { type FusedMassGrid, worldPosition } from '../src/engine/pose.ts';
import { crowdCellMaskLayout, isCellInMask, packCellMask } from '../src/render/crowd.ts';
import { holeWallGeometry } from '../src/render/holeWalls.ts';

const DIMS = [4, 3, 3] as const;
const index = (i: number, j: number, k: number): number => i + j * DIMS[0] + k * DIMS[0] * DIMS[1];

/** Two bones split along x, with one empty cell beside the carve so a carved face can meet empty space. */
const grid = (): FusedMassGrid => {
  const owner = new Uint8Array(DIMS[0] * DIMS[1] * DIMS[2]);
  for (let k = 0; k < DIMS[2]; k++) {
    for (let j = 0; j < DIMS[1]; j++) {
      for (let i = 0; i < DIMS[0]; i++) {
        owner[index(i, j, k)] = i < 2 ? 1 : 2;
      }
    }
  }
  owner[index(1, 2, 1)] = 0;
  return { size: 0.5, origin: [-1, 0, -1], dims: DIMS, owner };
};

const CELLS = [...new Array(DIMS[0] * DIMS[1] * DIMS[2]).keys()];
const centreOf = (g: FusedMassGrid, cell: number): number[] =>
  worldPosition(g, cell % DIMS[0], Math.floor(cell / DIMS[0]) % DIMS[1], Math.floor(cell / (DIMS[0] * DIMS[1])));
const cellAt = (g: FusedMassGrid, point: readonly number[]): number | undefined =>
  CELLS.find((cell) => centreOf(g, cell).every((value, axis) => Math.abs(value - point[axis]!) < 1e-6));

/** Every face a wall belongs on, as `carved>neighbour`, found by comparing every pair of adjacent cells. */
const expectedFaces = (g: FusedMassGrid, carved: readonly number[]): Set<string> => {
  const faces = new Set<string>();
  for (const a of carved) {
    for (const b of CELLS) {
      const distance = Math.hypot(...centreOf(g, a).map((value, axis) => value - centreOf(g, b)[axis]!));
      if (Math.abs(distance - g.size) < 1e-6 && g.owner[b] !== 0 && !carved.includes(b)) {
        faces.add(`${a}>${b}`);
      }
    }
  }
  return faces;
};

interface Wall {
  readonly face: string;
  readonly cell: number;
  readonly bone: number;
  readonly facesHole: boolean;
}

/** Each quad of the wall geometry, read back to the cells on either side of it. */
const wallsOf = (g: FusedMassGrid, carved: readonly number[]): Wall[] => {
  const geometry = holeWallGeometry(g, carved, new Color('#7a1c16'), 0);
  if (!geometry) {
    return [];
  }
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const indices = geometry.getIndex()!;
  const walls: Wall[] = [];
  for (let first = 0; first < indices.count; first += 6) {
    const vertices = [0, 1, 2, 3, 4, 5].map((offset) => indices.getX(first + offset));
    const corner = (vertex: number): number[] => [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
    const unique = [...new Set(vertices)];
    const centre = [0, 1, 2].map((axis) => unique.reduce((sum, vertex) => sum + corner(vertex)[axis]!, 0) / 4);
    const n = [normal.getX(vertices[0]!), normal.getY(vertices[0]!), normal.getZ(vertices[0]!)];
    const inside = cellAt(
      g,
      centre.map((value, axis) => value + (n[axis]! * g.size) / 2),
    );
    const behind = cellAt(
      g,
      centre.map((value, axis) => value - (n[axis]! * g.size) / 2),
    );
    // Both triangles wind anticlockwise seen from the hole side, so they are front faces from inside the pit.
    const facesHole = [0, 3].every((start) => {
      const [a, b, c] = vertices.slice(start, start + 3).map(corner) as [number[], number[], number[]];
      const ab = [0, 1, 2].map((axis) => b[axis]! - a[axis]!);
      const ac = [0, 1, 2].map((axis) => c[axis]! - a[axis]!);
      const cross = [
        ab[1]! * ac[2]! - ab[2]! * ac[1]!,
        ab[2]! * ac[0]! - ab[0]! * ac[2]!,
        ab[0]! * ac[1]! - ab[1]! * ac[0]!,
      ];
      return cross[0]! * n[0]! + cross[1]! * n[1]! + cross[2]! * n[2]! > 0;
    });
    walls.push({
      face: `${inside}>${behind}`,
      cell: geometry.getAttribute('cellIndex').getX(vertices[0]!),
      bone: geometry.getAttribute('boneIndex').getX(vertices[0]!),
      facesHole,
    });
  }
  return walls;
};

describe('hole walls', () => {
  it('puts one inward wall on each face between a carved cell and a filled uncarved neighbour, and none elsewhere', () => {
    const g = grid();
    // Two adjacent carved cells, one beside the empty cell and one on the grid's edge, across the bone boundary.
    const carved = [index(1, 1, 1), index(2, 1, 1), index(0, 0, 0)];
    const expected = expectedFaces(g, carved);
    const walls = wallsOf(g, carved);

    expect(expected.size).toBeGreaterThan(0);
    expect(walls.map(({ face }) => face).sort()).toEqual([...expected].sort());
    for (const wall of walls) {
      expect(wall.facesHole).toBe(true);
      const neighbour = Number(wall.face.split('>')[1]);
      expect(wall.cell).toBe(neighbour);
      expect(wall.bone).toBe(g.owner[neighbour]! - 1);
    }
  });

  it('owns each wall by an uncarved cell, so the carve mask keeps it until that cell is carved and its wall moves deeper', () => {
    const g = grid();
    const layout = crowdCellMaskLayout(g.owner.length, 1);
    const data = new Float32Array(layout.width * layout.height);
    const first = [index(0, 1, 1)];
    packCellMask(data, layout, 0, first);
    const before = wallsOf(g, first);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every(({ cell }) => !isCellInMask(data, layout, 0, cell))).toBe(true);

    const next = index(1, 1, 1);
    const shared = before.filter(({ cell }) => cell === next);
    expect(shared).toHaveLength(1);
    const deeper = [...first, next];
    packCellMask(data, layout, 0, deeper);
    // A wall built before the deeper carve collapses through the mask until the rebuild drops it.
    expect(isCellInMask(data, layout, 0, shared[0]!.cell)).toBe(true);
    const after = wallsOf(g, deeper);
    expect(after.some(({ cell }) => cell === next)).toBe(false);
    expect(after.some(({ face }) => face.startsWith(`${next}>`))).toBe(true);
    expect(after.every(({ cell }) => !isCellInMask(data, layout, 0, cell))).toBe(true);
  });
});
