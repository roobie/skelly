import { boxFromMinMax } from '../../core/geometry.ts';
import type { KeepOut, PartDef, PartFamily } from '../../core/schema.ts';
import { box, NEG_Y, X } from './common.ts';

/**
 * A carry handle that stands to the left of the rail (-Z; the choice of side is fixed, not a param): a low shelf
 * on the rail reaches out past the receiver's side wall, and two pairs of posts and a grip bar stand on the
 * shelf's outer part. That leaves the whole top of the rail free for a full-size scope (its objective bell is
 * about 2.75u in radius, see scopeEnvelope.ts). Local origin is the rail face (y = 0), centred on the slot it
 * sits in along the bore, and on the bore line across.
 *
 * Sizes, before the handle was moved aside and enlarged: 8u long, 3.25u tall with a 1u bar, hand room
 * 6 x 2.5 x 2.25u. Now: 10u long, 4.5u tall with a 1.25u bar, hand room 7.5 x 3 x 2.5u.
 */
const HALF_LENGTH = 5;
const POST_LENGTH = 1.25;
const POST_THICKNESS = 0.5;
const HAND_HALF_WIDTH = 1.5;
/** The handle's centre line across the rail, to the left. */
const SIDE_OFFSET = -5;
/** The shelf is low enough to pass under a scope's objective bell and rings are not in its way. */
const SHELF_THICKNESS = 0.75;
/** The shelf reaches back over the rail this far from the bore line, and out to the outer posts. */
const SHELF_RAIL_EDGE_Z = -1;
const POST_TOP = 3.25;
const BAR_THICKNESS = 1.25;
/** The hand's room under the bar, between the posts, above the shelf. */
const HAND_HALF_LENGTH = HALF_LENGTH - POST_LENGTH;

const INNER_POST_Z: readonly [number, number] = [
  SIDE_OFFSET + HAND_HALF_WIDTH,
  SIDE_OFFSET + HAND_HALF_WIDTH + POST_THICKNESS,
];
const OUTER_POST_Z: readonly [number, number] = [
  SIDE_OFFSET - HAND_HALF_WIDTH - POST_THICKNESS,
  SIDE_OFFSET - HAND_HALF_WIDTH,
];

export const carryHandle: PartFamily = {
  name: 'carry-handle',
  params: {},
  build(): PartDef {
    const posts = (
      [
        ['inner', INNER_POST_Z],
        ['outer', OUTER_POST_Z],
      ] as const
    ).flatMap(([name, [z0, z1]]) => [
      box(`post-rear-${name}`, [-HALF_LENGTH, SHELF_THICKNESS, z0], [-HAND_HALF_LENGTH, POST_TOP, z1]),
      box(`post-front-${name}`, [HAND_HALF_LENGTH, SHELF_THICKNESS, z0], [HALF_LENGTH, POST_TOP, z1]),
    ]);
    const handRoom: KeepOut = {
      id: 'hand-room',
      kind: 'hand-room',
      box: boxFromMinMax(
        [-HAND_HALF_LENGTH, SHELF_THICKNESS, SIDE_OFFSET - HAND_HALF_WIDTH],
        [HAND_HALF_LENGTH, POST_TOP, SIDE_OFFSET + HAND_HALF_WIDTH],
      ),
    };
    return {
      family: 'carry-handle',
      solids: [
        box('shelf', [-HALF_LENGTH, 0, OUTER_POST_Z[0]], [HALF_LENGTH, SHELF_THICKNESS, SHELF_RAIL_EDGE_Z]),
        ...posts,
        box(
          'grip-bar',
          [-HALF_LENGTH, POST_TOP, OUTER_POST_Z[0]],
          [HALF_LENGTH, POST_TOP + BAR_THICKNESS, INNER_POST_Z[1]],
        ),
      ],
      ports: [{ id: 'base', mount: 'rail', gender: 'male', pos: [0, 0, 0], normal: NEG_Y, up: X, required: true }],
      keepOuts: [handRoom],
      axes: [],
    };
  },
};
