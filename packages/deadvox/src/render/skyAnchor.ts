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
const QUAD_VERTICES = 4;
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
}): { anchor: Point | undefined; sealed: boolean } => {
  const axis = dominantAxis(direction);
  const step = Math.sign(direction[axis]!);
  if (step === 0) {
    return { anchor: undefined, sealed: false };
  }
  const cell = point.map((value, index) =>
    Math.floor((value - lower[index]! + direction[index]! * cellSize * 1e-4) / cellSize),
  );
  while (within(cell, cells)) {
    const material = materialAt(cell as Point);
    if (material !== undefined) {
      if (!isOpening(material)) {
        return { anchor: undefined, sealed: true };
      }
      // Past the envelope rather than at the glass: the coarse sky field counts the whole envelope as blocked.
      return {
        anchor: point.map((value, index) =>
          index === axis
            ? (step > 0 ? lower[index]! + cells[index]! * cellSize : lower[index]!) + step * BLOCK_SIZE
            : value,
        ) as Point,
        sealed: false,
      };
    }
    cell[axis] = cell[axis]! + step;
  }
  return { anchor: undefined, sealed: false };
};

/** Where each opening cell looks out: its centre carried horizontally past the envelope, away from the cabin's middle. */
const openingOutlooks = (
  { size, cellSize, materialAt, isOpening }: OpeningField,
  cells: Point,
  lower: Point,
): { centre: Point; out: Point }[] => {
  const outlooks: { centre: Point; out: Point }[] = [];
  const reach = size.map((extent) => extent / 2);
  for (let x = 0; x < cells[0]; x++) {
    for (let y = 0; y < cells[1]; y++) {
      for (let z = 0; z < cells[2]; z++) {
        const material = materialAt([x, y, z]);
        if (material === undefined || !isOpening(material)) {
          continue;
        }
        const centre = [x, y, z].map((cell, index) => lower[index]! + (cell + 0.5) * cellSize) as Point;
        const axis = Math.abs(centre[0]) / reach[0]! > Math.abs(centre[2]) / reach[2]! ? 0 : 2;
        const out = [...centre] as Point;
        out[axis] = Math.sign(centre[axis]!) * (reach[axis]! + BLOCK_SIZE);
        outlooks.push({ centre, out });
      }
    }
  }
  return outlooks;
};

/**
 * An interior receiver whose face ray meets a window samples the sky there; one whose ray meets the roof or body
 * samples from the nearest window instead, as diffuse light spreads through a room from its openings. Without any
 * opening the cabin stays sealed and dark. Exterior faces retain the envelope anchor that relieves their
 * self-occlusion in the coarse sky field. Returns the vertices that borrowed a window's sky.
 */
export const addSkyOpeningAnchors = (geometry: BufferGeometry, field: OpeningField): number[] => {
  addSkyAnchors(geometry, field.size);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const anchors = geometry.getAttribute(SKY_ANCHOR_ATTRIBUTE);
  if (!anchors) {
    return [];
  }
  const lower: Point = [-field.size[0] / 2, 0, -field.size[2] / 2];
  const cells = field.size.map((extent) => Math.round(extent / field.cellSize)) as Point;
  let outlooks: ReturnType<typeof openingOutlooks> | undefined;
  const borrowed: number[] = [];
  // The receiver interpolates the anchor across a face, so a quad's corners must not look out of different windows:
  // the line between them crosses the envelope, which the sky field counts as blocked.
  for (let first = 0; first < position.count; first += QUAD_VERTICES) {
    const quad = Array.from({ length: Math.min(QUAD_VERTICES, position.count - first) }, (_, index) => first + index);
    const points = quad.map((vertex): Point => [position.getX(vertex), position.getY(vertex), position.getZ(vertex)]);
    const results = quad.map((vertex, index) =>
      openingAnchor({
        point: points[index]!,
        direction: [normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)],
        lower,
        cells,
        field,
      }),
    );
    if (!results.some(({ sealed }) => sealed)) {
      quad.forEach((vertex, index) => {
        if (results[index]!.anchor) {
          anchors.setXYZ(vertex, ...results[index]!.anchor!);
        }
      });
      continue;
    }
    outlooks ??= openingOutlooks(field, cells, lower);
    const centre = points[0]!.map((_, axis) => points.reduce((sum, point) => sum + point[axis]!, 0) / points.length);
    let nearest: Point | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const outlook of outlooks) {
      const distance = Math.hypot(...outlook.centre.map((value, axis) => value - centre[axis]!));
      if (distance < best) {
        best = distance;
        nearest = outlook.out;
      }
    }
    if (nearest) {
      for (const vertex of quad) {
        anchors.setXYZ(vertex, ...nearest);
        borrowed.push(vertex);
      }
    } else {
      quad.forEach((vertex, index) => {
        const direction: Point = [normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)];
        anchors.setXYZ(
          vertex,
          ...(points[index]!.map((value, axis) => value - direction[axis]! * (BLOCK_SIZE / 2)) as Point),
        );
      });
    }
  }
  return borrowed;
};
