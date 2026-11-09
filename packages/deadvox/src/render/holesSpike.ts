import { BufferAttribute, BufferGeometry, Color } from 'three';
import { worldPosition } from '../core/fusedMassCarving.ts';
import type { FusedMassGrid } from '../core/fusedMassFigure.ts';

// Spike only, never merged: side-by-side looks for a fused-mass hole, picked by the debug URL query `holes=`.
// a: the masked body drawn double-sided, back faces flesh. b: flesh walls built from the rest grid on each carve.
// d: a flesh block in each carved cell. d2: no collapse, carved cells' faces recoloured flesh. off: as on main.

export type HolesMode = 'off' | 'a' | 'b' | 'd' | 'd2';

const MODES: readonly HolesMode[] = ['off', 'a', 'b', 'd', 'd2'];

/** The `holes=` mode of a `debug=1` page; any other page draws holes as on main. */
export const holesModeFromSearch = (search: string): HolesMode => {
  const params = new URLSearchParams(search);
  const mode = params.get('holes') as HolesMode | null;
  return params.get('debug') === '1' && mode !== null && MODES.includes(mode) ? mode : 'off';
};

export const holesModeFromLocation = (): HolesMode =>
  holesModeFromSearch((globalThis as { location?: { search?: string } }).location?.search ?? '');

/** The flesh colour in the renderer's linear working space. */
export const fleshColour = (hex: string | undefined): Color => new Color(hex ?? '#7a1c16');

export const HOLES_FRAGMENT_DECLARATIONS = /* glsl */ `
uniform vec3 crowdFleshColour;
varying float vCrowdCarved;
`;

export const HOLES_VERTEX_DECLARATIONS = /* glsl */ `
varying float vCrowdCarved;
`;

/** d2: marks a carved cell's vertices instead of collapsing them. */
export const HOLES_DECAL_BEGIN_VERTEX = /* glsl */ `
vCrowdCarved = crowdCellCarved( crowdSlot, cellIndex ) ? 1.0 : 0.0;
`;

/** The collapse as on main, with the varying the fragment declares set to zero. */
export const HOLES_COLLAPSE_BEGIN_VERTEX = /* glsl */ `
vCrowdCarved = 0.0;
if ( crowdCellCarved( crowdSlot, cellIndex ) ) transformed = vec3( 0.0 );
`;

/** a: a back face seen through a hole is the inside of the body. d2: a carved cell's face is a wound. */
export const HOLES_COLOR_FRAGMENT = /* glsl */ `
if ( !gl_FrontFacing ) diffuseColor.rgb = crowdFleshColour;
diffuseColor.rgb = mix( diffuseColor.rgb, crowdFleshColour, vCrowdCarved );
`;

const cellOf = (dims: FusedMassGrid['dims'], index: number): [number, number, number] => [
  index % dims[0],
  Math.floor(index / dims[0]) % dims[1],
  Math.floor(index / (dims[0] * dims[1])),
];

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** Collects quads in the crowd geometry's attribute layout. */
class QuadBuilder {
  readonly position: number[] = [];
  readonly normal: number[] = [];
  readonly bone: number[] = [];
  readonly cell: number[] = [];

  /** A square of half-size `half` centred on `centre`, facing `normal` (an axis direction). */
  quad(
    centre: readonly number[],
    normal: readonly number[],
    { half, bone, cell }: { readonly half: number; readonly bone: number; readonly cell: number },
  ): void {
    const axis = normal.findIndex((value) => value !== 0);
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const sign = normal[axis]!;
    // u × v = axis for the cyclic order, so (u, v) corners run anticlockwise seen from +axis.
    const corners =
      sign > 0
        ? [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ]
        : [
            [-1, -1],
            [-1, 1],
            [1, 1],
            [1, -1],
          ];
    const points = corners.map(([a, b]) => {
      const point = [centre[0]!, centre[1]!, centre[2]!];
      point[u] = point[u]! + a! * half;
      point[v] = point[v]! + b! * half;
      return point;
    });
    for (const index of [0, 1, 2, 0, 2, 3]) {
      this.position.push(...points[index]!);
      this.normal.push(normal[0]!, normal[1]!, normal[2]!);
      this.bone.push(bone);
      this.cell.push(cell);
    }
  }

  geometry(flesh: Color, row: number): BufferGeometry {
    const count = this.bone.length;
    const colour = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colour[i * 3] = flesh.r;
      colour[i * 3 + 1] = flesh.g;
      colour[i * 3 + 2] = flesh.b;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.position), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normal), 3));
    geometry.setAttribute('color', new BufferAttribute(colour, 3));
    geometry.setAttribute('boneIndex', new BufferAttribute(new Float32Array(this.bone), 1));
    geometry.setAttribute('neighbourBone', new BufferAttribute(new Float32Array(count).fill(-1), 1));
    geometry.setAttribute('crowdEmission', new BufferAttribute(new Float32Array(count * 2), 2));
    geometry.setAttribute('cellIndex', new BufferAttribute(new Float32Array(this.cell), 1));
    geometry.setAttribute('crowdSlot', new BufferAttribute(new Float32Array(count).fill(row), 1));
    return geometry;
  }
}

/**
 * b: one quad on each face between a carved cell and a filled, uncarved neighbour, facing into the hole and owned by
 * the neighbour's bone and cell. Positions are the mesh's own unscaled rest frame, which `worldPosition` shares.
 */
export const holeWallGeometry = (
  grid: FusedMassGrid,
  carved: readonly number[],
  flesh: Color,
  row: number,
): BufferGeometry => {
  const { dims, owner, size } = grid;
  const carvedSet = new Set(carved);
  const quads = new QuadBuilder();
  for (const index of carved) {
    const [i, j, k] = cellOf(dims, index);
    for (const [di, dj, dk] of NEIGHBOURS) {
      const [ni, nj, nk] = [i + di, j + dj, k + dk];
      if (ni < 0 || nj < 0 || nk < 0 || ni >= dims[0] || nj >= dims[1] || nk >= dims[2]) {
        continue;
      }
      const neighbour = ni + nj * dims[0] + nk * dims[0] * dims[1];
      const bone = owner[neighbour]!;
      if (bone === 0 || carvedSet.has(neighbour)) {
        continue;
      }
      // The shared face sits half a cell from the carved cell's centre toward the neighbour, facing back into the hole.
      const centre = worldPosition(grid, i, j, k);
      const face = [centre[0] + (di * size) / 2, centre[1] + (dj * size) / 2, centre[2] + (dk * size) / 2];
      quads.quad(face, [-di, -dj, -dk], { half: size / 2, bone: bone - 1, cell: neighbour });
    }
  }
  return quads.geometry(flesh, row);
};

/** The fraction of a cell a d-mode flesh block fills along each axis. */
const BLOCK_FILL = 0.6;

/** d: a flesh cube at each carved cell's centre, owned by that cell's bone. */
export const holeBlockGeometry = (
  grid: FusedMassGrid,
  carved: readonly number[],
  flesh: Color,
  row: number,
): BufferGeometry => {
  const { dims, owner, size } = grid;
  const half = (size * BLOCK_FILL) / 2;
  const quads = new QuadBuilder();
  for (const index of carved) {
    const bone = owner[index]!;
    if (bone === 0) {
      continue;
    }
    const centre = worldPosition(grid, ...cellOf(dims, index));
    for (const normal of NEIGHBOURS) {
      const face = [centre[0] + normal[0] * half, centre[1] + normal[1] * half, centre[2] + normal[2] * half];
      quads.quad(face, normal, { half, bone: bone - 1, cell: index });
    }
  }
  return quads.geometry(flesh, row);
};
