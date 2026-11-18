import type { SkyBounds } from '@skelly/engine/sky';
import { BufferAttribute, type BufferGeometry, type Material, Matrix3, type Matrix4, Vector3 } from 'three';

/** Vertex attribute holding where a surface samples the sky from; the sky receiver patch reads it when `SKY_ANCHOR` is defined. */
export const SKY_ANCHOR_ATTRIBUTE = 'skyAnchor';

/** How far, in blocks, the receiver steps out along a surface's normal from its anchor before it samples the sky. */
export const SKY_RECEIVER_STEP = 0.5;

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

/** How far, in blocks, a surface looks along its normal for an open cell, and how finely. */
const CELL_EXIT_REACH = 2;
const CELL_EXIT_STEP = 0.25;

/** A ray leaving a surface it lies on would otherwise count that surface's own box as ahead of it. */
const ENTRY_EPSILON = 1e-4;

/** How far along `direction` the ray from `origin` first enters a box ahead of it; boxes it starts in or on don't count. */
const firstEntry = (origin: Vector3, direction: Vector3, boxes: readonly SkyBounds[]): number => {
  const from = origin.toArray();
  const along = direction.toArray();
  let nearest = Number.POSITIVE_INFINITY;
  for (const { min, max } of boxes) {
    let near = Number.NEGATIVE_INFINITY;
    let far = Number.POSITIVE_INFINITY;
    for (let axis = 0; axis < 3 && near <= far; axis++) {
      const [start, step] = [from[axis]!, along[axis]!];
      if (step === 0) {
        if (start < min[axis]! || start > max[axis]!) {
          far = Number.NEGATIVE_INFINITY;
        }
        continue;
      }
      const [a, b] = [(min[axis]! - start) / step, (max[axis]! - start) / step];
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
    }
    if (near > ENTRY_EPSILON && near <= far) {
      nearest = Math.min(nearest, near);
    }
  }
  return nearest;
};

/**
 * Gives a placed model's geometry a sky anchor per vertex: the vertex carried along its normal until the receiver's
 * step past it lands in a cell the sky field counts as open, as `addSkyAnchors` does for an envelope, so a body that
 * blocks sky light doesn't shade its own skin. `toWorld` places the geometry; `blocked` takes a cell in blocks.
 *
 * The search never passes the body's own geometry (`own`, boxes in blocks): an open cell beyond the roof is not the
 * sky a seat under it sees. A surface that finds no open cell before its own geometry or within reach samples where it
 * stands, short of that geometry, and reads the shade the body's cells carry.
 */
export const addSkyCellAnchors = (
  geometry: BufferGeometry,
  {
    toWorld,
    blocked,
    own,
    blockSize,
  }: {
    toWorld: Matrix4;
    blocked: (x: number, y: number, z: number) => boolean;
    own: readonly SkyBounds[];
    blockSize: number;
  },
): void => {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const toLocal = toWorld.clone().invert();
  const normalToWorld = new Matrix3().getNormalMatrix(toWorld);
  const point = new Vector3();
  const direction = new Vector3();
  const probe = new Vector3();
  const anchors = new Float32Array(position.count * 3);
  for (let vertex = 0; vertex < position.count; vertex++) {
    point.fromBufferAttribute(position, vertex).applyMatrix4(toWorld).divideScalar(blockSize);
    direction.fromBufferAttribute(normal, vertex).applyMatrix3(normalToWorld).normalize();
    // The receiver samples a step past its anchor, so the sample must stop that step short of the body's geometry.
    const limit = firstEntry(point, direction, own) - SKY_RECEIVER_STEP;
    let moved = Math.min(0, limit);
    for (let reach = 0; reach <= CELL_EXIT_REACH && reach < limit; reach += CELL_EXIT_STEP) {
      probe
        .copy(direction)
        .multiplyScalar(reach + SKY_RECEIVER_STEP)
        .add(point);
      if (!blocked(Math.floor(probe.x), Math.floor(probe.y), Math.floor(probe.z))) {
        // The first open probe can sit on the boundary it crossed; half a step on keeps the sample inside the cell.
        moved = reach > 0 ? Math.min(reach + CELL_EXIT_STEP / 2, limit) : 0;
        break;
      }
    }
    point.addScaledVector(direction, moved);
    point
      .multiplyScalar(blockSize)
      .applyMatrix4(toLocal)
      .toArray(anchors, vertex * 3);
  }
  geometry.setAttribute(SKY_ANCHOR_ATTRIBUTE, new BufferAttribute(anchors, 3));
};

/** A copy of `material` that draws with the sky anchors its geometry carries. */
export const skyAnchoredCopy = <M extends Material>(material: M): M => {
  const copy = material.clone() as M;
  copy.defines = { ...material.defines, SKY_ANCHOR: '' };
  return copy;
};
