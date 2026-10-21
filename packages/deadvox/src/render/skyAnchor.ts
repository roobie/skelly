import { BufferAttribute, type BufferGeometry } from 'three';
import { BLOCK_SIZE } from '../core/scale.ts';

/** Vertex attribute holding where a surface samples the sky from; the sky receiver patch reads it when `SKY_ANCHOR` is defined. */
export const SKY_ANCHOR_ATTRIBUTE = 'skyAnchor';

/**
 * Gives a shaped piece's geometry a sky anchor per vertex: the vertex pushed along its normal to the face of the
 * piece's envelope (`size` in blocks, x and z centred, y from 0). The sky field counts every cell of the envelope
 * as blocked, so a surface set back from the envelope reads its own blocked cell and renders black; sampling from
 * the envelope face reads the open cell outside it, as a box that fills its cells does.
 */
export const addSkyAnchors = (geometry: BufferGeometry, size: readonly [number, number, number]): void => {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const lower = [-size[0] / 2, 0, -size[2] / 2];
  const upper = [size[0] / 2, size[1], size[2] / 2];
  const anchors = new Float32Array(position.count * 3);
  for (let vertex = 0; vertex < position.count; vertex++) {
    const point = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
    const direction = [normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)];
    let reach = Number.POSITIVE_INFINITY;
    for (let axis = 0; axis < 3; axis++) {
      const along = direction[axis]!;
      if (Math.abs(along) > 1e-6) {
        reach = Math.min(reach, ((along > 0 ? upper[axis]! : lower[axis]!) - point[axis]!) / along);
      }
    }
    const distance = Number.isFinite(reach) ? Math.max(reach, 0) : 0;
    for (let axis = 0; axis < 3; axis++) {
      anchors[vertex * 3 + axis] = point[axis]! + direction[axis]! * distance;
    }
  }
  geometry.setAttribute(SKY_ANCHOR_ATTRIBUTE, new BufferAttribute(anchors, 3));
};

type Point = [number, number, number];
interface OpeningField {
  readonly size: Point;
  readonly cellSize: number;
  readonly materialAt: (cell: readonly [number, number, number]) => string | undefined;
  readonly isOpening: (material: string) => boolean;
}
const dominantAxis = (direction: Point): number =>
  direction.reduce((best, value, index) => (Math.abs(value) > Math.abs(direction[best]!) ? index : best), 0);
const within = (cell: readonly number[], cells: readonly number[]): boolean =>
  cell.every((value, index) => value >= 0 && value < cells[index]!);
const openingAnchor = ({
  point,
  direction,
  lower,
  cells,
  field: { cellSize, materialAt, isOpening },
}: {
  point: Point;
  direction: Point;
  lower: Point;
  cells: Point;
  field: OpeningField;
}): Point | undefined => {
  const axis = dominantAxis(direction);
  const step = Math.sign(direction[axis]!);
  if (step === 0) {
    return undefined;
  }
  const cell = point.map((value, index) =>
    Math.floor((value - lower[index]! + direction[index]! * cellSize * 1e-4) / cellSize),
  );
  while (within(cell, cells)) {
    const material = materialAt(cell as Point);
    if (material !== undefined) {
      if (!isOpening(material)) {
        return point.map((value, index) => value - direction[index]! * (BLOCK_SIZE / 2)) as Point;
      }
      return point.map((value, index) =>
        index === axis ? lower[index]! + (cell[index]! + Number(step > 0)) * cellSize : value,
      ) as Point;
    }
    cell[axis] = cell[axis]! + step;
  }
  return undefined;
};

/**
 * Keeps an interior receiver in its cabin unless its face ray reaches an authored opening. Exterior faces retain the
 * envelope anchor that relieves their self-occlusion in the coarse sky field.
 */
export const addSkyOpeningAnchors = (geometry: BufferGeometry, field: OpeningField): void => {
  addSkyAnchors(geometry, field.size);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const anchors = geometry.getAttribute(SKY_ANCHOR_ATTRIBUTE);
  if (!anchors) {
    return;
  }
  const lower: Point = [-field.size[0] / 2, 0, -field.size[2] / 2];
  const cells = field.size.map((extent) => Math.round(extent / field.cellSize)) as Point;
  for (let vertex = 0; vertex < position.count; vertex++) {
    const point: Point = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
    const direction: Point = [normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)];
    const anchor = openingAnchor({ point, direction, lower, cells, field });
    if (anchor) {
      anchors.setXYZ(vertex, ...anchor);
    }
  }
};
