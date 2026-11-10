import {
  BLUEPRINTS,
  fittedGrid,
  GLASS,
  keyVoxel,
  type MeshBuffers,
  meshGrid,
  type PartData,
  type ShapeData,
  VOXEL,
  voxelKey,
} from '@skelly/engine/vehicles';
import { BufferAttribute, BufferGeometry } from 'three';
import { addSkyOpeningAnchors } from './skyAnchor.ts';

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
