import type { FigureDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { Body } from './physics.ts';
import { type SolidAt, sweepCube } from './raycast.ts';

/** A kind of point that rides the body, each keeping its own margin from walls. */
export type BodyPointRole = keyof FigureDef['clearanceMetres'];

/** The part of a body its points are anchored in: the box collision keeps out of solid cells. */
export type ClearanceBody = Pick<Body, 'pos' | 'height'>;

/** On the box's centre line at the point's height, held low and high enough that a cube of the margin stays inside. */
export const clearanceAnchor = (body: ClearanceBody, point: Readonly<Vec3>, marginBlocks: number): Vec3 => [
  body.pos[0],
  Math.min(Math.max(point[1], body.pos[1] + marginBlocks), body.pos[1] + body.height - marginBlocks),
  body.pos[2],
];

/**
 * Where a point that rides the body may sit: its posed position, or where a cube of its margin swept there from the
 * body's anchor first touches a solid cell. See `packages/deadvox/docs/body-point-clearance.md`, "The mechanism".
 */
export const clearBodyPoint = ({
  body,
  point,
  marginBlocks,
  isSolid,
}: {
  body: ClearanceBody;
  point: Readonly<Vec3>;
  marginBlocks: number;
  isSolid: SolidAt;
}): Vec3 => {
  const anchor = clearanceAnchor(body, point, marginBlocks);
  const travelled = sweepCube(anchor, point, marginBlocks, isSolid);
  // A blocked anchor means cell solidity disagrees with what the box was stepped against; the centre line fails closed.
  if (travelled === undefined) {
    return anchor;
  }
  if (travelled === 1) {
    return [point[0], point[1], point[2]];
  }
  return [0, 1, 2].map((axis) => anchor[axis]! + (point[axis]! - anchor[axis]!) * travelled) as Vec3;
};
