import { BufferAttribute, type BufferGeometry } from 'three';

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
