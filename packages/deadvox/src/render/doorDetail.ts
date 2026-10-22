import { type BoxGeometry, type BufferGeometry, Color } from 'three';
import type { FurnitureDef } from '../core/schema.ts';
import { type Box, colouredBox, mergedDetail } from './furnitureDetail.ts';

export type DoorDetail = NonNullable<NonNullable<FurnitureDef['door']>['detail']>;

/** Where the hinges sit along the hinge edge, as shares of it: near both ends, and evenly between. */
const HINGE_SPREAD = { from: 0.12, to: 0.88 } as const;

/** One face of a leaf: its plane `z0` and its outward sign `side`. */
interface Face {
  z0: number;
  side: number;
  metal: Color;
}

/** Grip and its mount, standing off one face. */
function handle(box: Box, { handle: grip, relief }: DoorDetail, [u, v]: [number, number], face: Face): void {
  const { kind, length, thickness } = grip;
  const { z0, side, metal } = face;
  const out = (from: number, depth: number) => z0 + side * (from + depth / 2);
  const standoff = relief + 2 * thickness;
  switch (kind) {
    case 'knob':
    case 'lever':
      box([u, v, out(0, relief + thickness)], [thickness, thickness, relief + thickness], metal);
      if (kind === 'knob') {
        box([u, v, out(relief + thickness, thickness)], [length, length, thickness], metal);
      } else {
        // A lever points back toward the hinge, so the free edge stays clear.
        box(
          [u - length / 2 + thickness / 2, v, out(relief + thickness, thickness)],
          [length, thickness, thickness],
          metal,
        );
      }
      break;
    case 'pull':
    case 'bar': {
      // A pull runs along the hinge edge; a bar runs across the leaf, toward the hinge.
      const along = kind === 'pull';
      for (const end of [-1, 1]) {
        const offset = end * (length / 2 - thickness / 2);
        box(
          [along ? u : u + offset, along ? v + offset : v, out(0, standoff)],
          [thickness, thickness, standoff],
          metal,
        );
      }
      box([u, v, out(standoff, thickness)], [along ? thickness : length, along ? length : thickness, thickness], metal);
      break;
    }
    case 'ring':
      // A ring on a plate, lying flat so it stands little proud of a hatch that is walked over.
      box([u, v, out(0, relief + thickness / 2)], [length * 0.4, length * 0.4, relief + thickness / 2], metal);
      for (const end of [-1, 1]) {
        const offset = end * (length / 2 - thickness / 2);
        box([u, v + offset, out(relief, thickness)], [length, thickness, thickness], metal);
        box([u + offset, v, out(relief, thickness)], [thickness, length - 2 * thickness, thickness], metal);
      }
      break;
    default:
      throw new Error(`unsupported door handle: ${kind satisfies never}`);
  }
}

/**
 * A leaf of `length` from its hinge edge, `along` that edge and `thickness` deep, centred on its own middle: x runs
 * from the hinge, y along it, z through the leaf. Both faces carry the same detail, so either may face out.
 */
export function doorDetail(def: FurnitureDef, [length, along, thickness]: [number, number, number]): BufferGeometry {
  const detail = def.door?.detail;
  if (!detail) {
    throw new Error(`door "${def.id}" has no detail`);
  }
  const { relief, frame, seam, fields, hinges } = detail;
  const parts: BoxGeometry[] = [];
  const box: Box = (position, size, color) => colouredBox(parts, position, size, color);
  const base = new Color(def.color);
  const core = base.clone().multiplyScalar(0.62);
  const metal = new Color(detail.hardware);
  const [across, down] = fields;
  const fieldLength = (length - 2 * frame - (across - 1) * seam) / across;
  const fieldAlong = (along - 2 * frame - (down - 1) * seam) / down;
  if (fieldLength <= 0 || fieldAlong <= 0) {
    throw new Error(`door "${def.id}" leaves no room for its fields`);
  }
  box([0, 0, 0], [length, along, thickness], core);
  for (const side of [-1, 1]) {
    const z0 = (side * thickness) / 2;
    for (let i = 0; i < across; i++) {
      for (let j = 0; j < down; j++) {
        box(
          [
            -length / 2 + frame + fieldLength / 2 + i * (fieldLength + seam),
            -along / 2 + frame + fieldAlong / 2 + j * (fieldAlong + seam),
            z0 + (side * relief) / 2,
          ],
          [fieldLength, fieldAlong, relief],
          base,
        );
      }
    }
    for (let i = 0; i < hinges.count; i++) {
      const share =
        hinges.count === 1 ? 0.5 : HINGE_SPREAD.from + ((HINGE_SPREAD.to - HINGE_SPREAD.from) * i) / (hinges.count - 1);
      const depth = relief * 1.5;
      box(
        [-length / 2 + hinges.length / 2, -along / 2 + share * along, z0 + (side * depth) / 2],
        [hinges.length, hinges.width, depth],
        metal,
      );
    }
    handle(box, detail, [length / 2 - detail.handle.fromFreeEdge, -along / 2 + detail.handle.along * along], {
      z0,
      side,
      metal,
    });
  }
  return mergedDetail(parts);
}
