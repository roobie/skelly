import { boxFromMinMax } from '../../core/geometry.ts';
import type { KeepOut, PartDef, PartFamily } from '../../core/schema.ts';
import { box, NEG_Y, X } from './common.ts';

/**
 * A carry handle that stands on the receiver's top rail: two pairs of posts and a grip bar. Local origin is
 * the rail face (y = 0), centred on the slot it sits in. The posts stand outside the line of sight, and the
 * bar stays above it, so an optic on the same rail still sees past the handle.
 */
const HALF_LENGTH = 4;
const POST_LENGTH = 1;
const POST_Z: readonly [number, number] = [1.25, 1.75];
const POST_HEIGHT = 2.25;
const BAR_THICKNESS = 1;
/** The hand's room under the bar, between the posts. */
const HAND_HALF_LENGTH = HALF_LENGTH - POST_LENGTH;
const [HAND_HALF_WIDTH] = POST_Z;

export const carryHandle: PartFamily = {
  name: 'carry-handle',
  params: {},
  build(): PartDef {
    const posts = ([-1, 1] as const).flatMap((side) => {
      const [z0, z1] = side > 0 ? POST_Z : ([-POST_Z[1], -POST_Z[0]] as const);
      const name = side > 0 ? 'right' : 'left';
      return [
        box(`post-rear-${name}`, [-HALF_LENGTH, 0, z0], [-HAND_HALF_LENGTH, POST_HEIGHT, z1]),
        box(`post-front-${name}`, [HAND_HALF_LENGTH, 0, z0], [HALF_LENGTH, POST_HEIGHT, z1]),
      ];
    });
    const handRoom: KeepOut = {
      id: 'hand-room',
      kind: 'hand-room',
      box: boxFromMinMax([-HAND_HALF_LENGTH, 0, -HAND_HALF_WIDTH], [HAND_HALF_LENGTH, POST_HEIGHT, HAND_HALF_WIDTH]),
    };
    return {
      family: 'carry-handle',
      solids: [
        ...posts,
        box('grip-bar', [-HALF_LENGTH, POST_HEIGHT, -POST_Z[1]], [HALF_LENGTH, POST_HEIGHT + BAR_THICKNESS, POST_Z[1]]),
      ],
      ports: [{ id: 'base', mount: 'rail', gender: 'male', pos: [0, 0, 0], normal: NEG_Y, up: X, required: true }],
      keepOuts: [handRoom],
      axes: [],
    };
  },
};
