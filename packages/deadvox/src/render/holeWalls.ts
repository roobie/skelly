import { BufferAttribute, BufferGeometry, type Color } from 'three';
import { type FusedMassGrid, worldPosition } from '../../../engine/src/pose.ts';

// The baked GLB has no surface inside the body, so a carved cell alone would show the world through the hole.
// Walls rebuilt from the rest grid on each carve give the pit flesh on every side without remeshing the body.

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** Calls `visit` once per face between a carved cell and a filled, uncarved neighbour. */
const eachWallFace = (
  { dims, owner }: FusedMassGrid,
  carved: readonly number[],
  carvedSet: ReadonlySet<number>,
  visit: (carvedCell: number, direction: readonly [number, number, number], neighbour: number) => void,
): void => {
  const plane = dims[0] * dims[1];
  for (const index of carved) {
    const i = index % dims[0];
    const j = Math.floor(index / dims[0]) % dims[1];
    const k = Math.floor(index / plane);
    for (const direction of NEIGHBOURS) {
      const ni = i + direction[0];
      const nj = j + direction[1];
      const nk = k + direction[2];
      if (ni < 0 || nj < 0 || nk < 0 || ni >= dims[0] || nj >= dims[1] || nk >= dims[2]) {
        continue;
      }
      const neighbour = ni + nj * dims[0] + nk * plane;
      if (owner[neighbour] !== 0 && !carvedSet.has(neighbour)) {
        visit(index, direction, neighbour);
      }
    }
  }
};

/** Quad corners in (u, v) order, anticlockwise seen from the face's normal for each sign. */
const CORNERS_POSITIVE = [-1, -1, 1, -1, 1, 1, -1, 1] as const;
const CORNERS_NEGATIVE = [-1, -1, -1, 1, 1, 1, 1, -1] as const;

/**
 * The flesh walls of `carved` cells, in the crowd geometry's attribute layout drawn through slot `row`: one quad on each
 * face between a carved cell and a filled, uncarved neighbour, facing into the hole and owned by the neighbour's bone and
 * cell, so the neighbour's own carve or sever hides it. Positions are the mesh's unscaled rest frame, which
 * `worldPosition` shares. Undefined when no face qualifies.
 */
export const holeWallGeometry = (
  grid: FusedMassGrid,
  carved: readonly number[],
  flesh: Color,
  row: number,
): BufferGeometry | undefined => {
  const carvedSet = new Set(carved);
  let quads = 0;
  eachWallFace(grid, carved, carvedSet, () => {
    quads += 1;
  });
  if (quads === 0) {
    return undefined;
  }
  const vertices = quads * 4;
  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const colour = new Float32Array(vertices * 3);
  const bone = new Float32Array(vertices);
  const cell = new Float32Array(vertices);
  const index = new Uint32Array(quads * 6);
  const { dims, owner, size } = grid;
  const half = size / 2;
  let quad = 0;
  eachWallFace(grid, carved, carvedSet, (carvedCell, direction, neighbour) => {
    const centre = worldPosition(
      grid,
      carvedCell % dims[0],
      Math.floor(carvedCell / dims[0]) % dims[1],
      Math.floor(carvedCell / (dims[0] * dims[1])),
    );
    const axis = direction.findIndex((step) => step !== 0);
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    // The wall faces back into the hole, against the direction to the neighbour.
    const sign = -direction[axis]!;
    const corners = sign > 0 ? CORNERS_POSITIVE : CORNERS_NEGATIVE;
    const first = quad * 4;
    for (let corner = 0; corner < 4; corner++) {
      const vertex = first + corner;
      const at = vertex * 3;
      position[at + axis] = centre[axis]! - sign * half;
      position[at + u] = centre[u]! + corners[corner * 2]! * half;
      position[at + v] = centre[v]! + corners[corner * 2 + 1]! * half;
      normal[at + axis] = sign;
      colour[at] = flesh.r;
      colour[at + 1] = flesh.g;
      colour[at + 2] = flesh.b;
      bone[vertex] = owner[neighbour]! - 1;
      cell[vertex] = neighbour;
    }
    const at = quad * 6;
    index[at] = first;
    index[at + 1] = first + 1;
    index[at + 2] = first + 2;
    index[at + 3] = first;
    index[at + 4] = first + 2;
    index[at + 5] = first + 3;
    quad += 1;
  });
  const geometry = new BufferGeometry();
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('normal', new BufferAttribute(normal, 3));
  geometry.setAttribute('color', new BufferAttribute(colour, 3));
  geometry.setAttribute('boneIndex', new BufferAttribute(bone, 1));
  geometry.setAttribute('neighbourBone', new BufferAttribute(new Float32Array(vertices).fill(-1), 1));
  geometry.setAttribute('crowdEmission', new BufferAttribute(new Float32Array(vertices * 2), 2));
  geometry.setAttribute('cellIndex', new BufferAttribute(cell, 1));
  geometry.setAttribute('crowdSlot', new BufferAttribute(new Float32Array(vertices).fill(row), 1));
  return geometry;
};
