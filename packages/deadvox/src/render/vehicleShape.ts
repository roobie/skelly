import { BufferAttribute, BufferGeometry } from 'three';
import { BLUEPRINTS } from '../vehicles/catalogue.ts';
import { VOXEL } from '../vehicles/model.ts';
import { fittedGrid } from '../vehicles/solid.ts';
import { GLASS, keyVoxel, type MeshBuffers, meshGrid, voxelKey } from '../vehicles/voxels.ts';
import { addSkyOpeningAnchors } from './skyAnchor.ts';

/** One uncoloured mesh as plain arrays, so a worker can build it and hand over its buffers. */
export interface PartData {
  readonly attributes: readonly { readonly name: string; readonly array: Float32Array; readonly itemSize: number }[];
  readonly index: Uint32Array;
  /** One per quad, in vertex order: quad `q` owns vertices `4q` to `4q + 3`. */
  readonly materials: readonly string[];
  readonly quads: number;
  readonly sphere: { readonly center: readonly [number, number, number]; readonly radius: number };
}

/** What a blueprint less its removed parts looks like before any paint: the same for every look that shares both. */
export interface ShapeData {
  readonly solidBaseY: number;
  readonly solid: PartData | undefined;
  readonly clear: PartData | undefined;
}

const partOf = (
  buffers: MeshBuffers,
  lattice: readonly [number, number, number],
  materialAt: (cell: readonly [number, number, number]) => string | undefined,
  openings: readonly [number, number, number][],
): PartData | undefined => {
  if (buffers.quads === 0) {
    return undefined;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(buffers.normals, 3));
  geometry.setIndex(new BufferAttribute(buffers.indices, 1));
  geometry.scale(VOXEL, VOXEL, VOXEL);
  const [length, , width] = lattice;
  geometry.translate((-length * 4 * VOXEL) / 2, 0, (-width * 4 * VOXEL) / 2);
  addSkyOpeningAnchors(geometry, {
    size: lattice.map((cells) => cells * 4 * VOXEL) as [number, number, number],
    cellSize: VOXEL,
    materialAt,
    isOpening: (material) => material === GLASS,
    openings,
  });
  geometry.computeBoundingSphere();
  const { center, radius } = geometry.boundingSphere!;
  return {
    attributes: Object.entries(geometry.attributes).map(([name, attribute]) => ({
      name,
      array: attribute.array as Float32Array,
      itemSize: attribute.itemSize,
    })),
    index: geometry.index!.array as Uint32Array,
    materials: buffers.materials,
    quads: buffers.quads,
    sphere: { center: [center.x, center.y, center.z], radius },
  };
};

/** The expensive part of showing a vehicle: voxel meshing and sky anchors. It touches no DOM, so a worker can run it. */
export const buildShape = (blueprint: string, removed: readonly string[]): ShapeData => {
  const { grid, baseY } = fittedGrid(blueprint, removed);
  const { solid, clear } = meshGrid(grid, (material) => material === GLASS);
  const { lattice } = BLUEPRINTS[blueprint]!;
  const materialAt = (cell: readonly [number, number, number]) => grid.get(voxelKey(...cell));
  const openings = [...grid].filter(([, voxel]) => voxel === GLASS).map(([voxelAt]) => keyVoxel(voxelAt));
  return {
    solidBaseY: baseY * VOXEL,
    solid: partOf(solid, lattice, materialAt, openings),
    clear: partOf(clear, lattice, materialAt, openings),
  };
};

/** The buffers of a shape, for a worker to transfer instead of copy. */
export const shapeBuffers = (shape: ShapeData): ArrayBuffer[] =>
  [shape.solid, shape.clear].flatMap((part) =>
    part ? [...part.attributes.map(({ array }) => array.buffer as ArrayBuffer), part.index.buffer as ArrayBuffer] : [],
  );
