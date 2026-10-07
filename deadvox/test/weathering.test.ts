import { describe, expect, it } from 'vitest';
import { buildMesh } from '../src/core/mesher.ts';
import { PADDED } from '../src/core/meshInput.ts';
import { OCCLUSION_RADIUS, WIDE } from '../src/core/occlusion.ts';

const R = OCCLUSION_RADIUS;
const colors = new Uint8Array([0, 0, 0, 180, 160, 140]);
type Cell = (x: number, y: number, z: number) => boolean;

const gridFor = (size: number, border: number, solid: Cell): Uint8Array => {
  const grid = new Uint8Array(size ** 3);
  for (let index = 0; index < grid.length; index++) {
    const x = index % size;
    const z = Math.floor(index / size) % size;
    const y = Math.floor(index / size ** 2);
    grid[index] = solid(x - border, y - border, z - border) ? 1 : 0;
  }
  return grid;
};

const meshFor = (solid: Cell) => {
  const padded = gridFor(PADDED, 1, solid);
  const ids = new Uint16Array(padded.length);
  ids.set(padded);
  return buildMesh(ids, colors, undefined, gridFor(WIDE, R, solid));
};

const weatherAt = (mesh: ReturnType<typeof meshFor>, position: readonly number[]): [number, number] => {
  for (let vertex = 0; vertex < mesh.positions.length / 3; vertex++) {
    const at = [mesh.positions[vertex * 3]!, mesh.positions[vertex * 3 + 1]!, mesh.positions[vertex * 3 + 2]!];
    const normal = [mesh.normals[vertex * 3]!, mesh.normals[vertex * 3 + 1]!, mesh.normals[vertex * 3 + 2]!];
    if (normal[0] === 1 && at.every((value, axis) => value === position[axis])) {
      return [mesh.weathering[vertex * 2]!, mesh.weathering[vertex * 2 + 1]!];
    }
  }
  throw new Error(`missing weathered face vertex at ${position}`);
};

describe('mesher weathering attributes', () => {
  it('reduces rain exposure below an overhang', () => {
    const wall = (x: number, y: number, z: number) => x === 10 && y === 10 && z === 10;
    const [exposed] = weatherAt(meshFor(wall), [11, 10, 10]);
    const [sheltered] = weatherAt(
      meshFor((x, y, z) => wall(x, y, z) || (x === 11 && y === 11 && z === 10)),
      [11, 10, 10],
    );
    expect(sheltered).toBeLessThan(exposed);
  });

  it('increases ground proximity at low exterior wall faces', () => {
    const ground = (x: number, y: number, z: number) => x === 11 && y === 9 && z === 10;
    const [, low] = weatherAt(
      meshFor((x, y, z) => ground(x, y, z) || (x === 10 && y === 10 && z === 10)),
      [11, 10, 10],
    );
    const [, high] = weatherAt(
      meshFor((x, y, z) => ground(x, y, z) || (x === 10 && y === 15 && z === 10)),
      [11, 15, 10],
    );
    expect(low).toBeGreaterThan(high);
  });
});
