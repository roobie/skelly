import { boxFromMinMax } from '../../core/geometry.ts';
import type { ExtrudedPolygonSolid, KeepOut, PartDef, PartFamily, Vec2 } from '../../core/schema.ts';
import { NEG_X, NEG_Y, octagonPrism, X, Y, Z } from './common.ts';

/**
 * A carry handle in three parts, to the left of the rifle (-Z; the side is fixed, not a param): a trunnion block
 * bolted to the shroud's left wall at its rear, a single strut that runs diagonally up and to the left from the
 * block, and a grip bar on the strut's top end that is level and parallel to the bore and reaches back from the strut
 * toward the stock. The diagonal and the level bar both come from port orientation (see docs/anti-materiel.md,
 * "Carry handle and scope envelope"): the strut is an octagonal prism along its own X, and the strut's top port is
 * tilted back by the strut's angle so the bar's frame ends up axis-aligned. No solid is skewed.
 *
 * The strut is a 3-4-5 triangle so its end lands on the 0.25u grid: 7.5u between its two ports, 6u up and 4.5u to
 * the left, which is 36.87 degrees from vertical.
 *
 * The strut's ends are sunk into the trunnion and the bar, so no joint or gap shows. That is the nesting
 * allowance every pair of directly connected parts has (TOLERANCE.interface, 0.75u, see `connectionAllowances` in
 * core/rules.ts); the sinks stay under it.
 */
export const STRUT_LENGTH = 7.5;
/** Octagon flat-to-flat half-width: a 1.5u (17 mm) strut. */
export const STRUT_FLAT_RADIUS = 0.75;
/** Direction cosines of the strut's axis against vertical (up) and sideways (left): a 4-3-5 triangle. */
export const STRUT_UP = 0.8;
export const STRUT_LEFT = 0.6;
export const STRUT_TILT_DEGREES = (Math.atan2(STRUT_LEFT, STRUT_UP) * 180) / Math.PI;
/** How far the strut's solid reaches past each port along its axis: into the trunnion, and into the bar. */
export const STRUT_SINK_BASE = 0.5;
export const STRUT_SINK_TOP = 0.625;

export const TRUNNION_HALF_LENGTH = 2;

/**
 * The trunnion's section across the bore (profile axes Y, Z): the shroud wall at z = 0, the block reaching 2u out to
 * the left. Its top face is the plane through the strut's port perpendicular to the strut's axis, so the strut
 * stands square on it: from the wall (2.25, 0) out to (0.75, -2) along the direction (0.6, 0.8), 1.25u either side of
 * the port at (1.5, -1). Counter-clockwise, convex.
 */
const TRUNNION_PROFILE: readonly Vec2[] = [
  [-1.5, 0],
  [-1.5, -2],
  [0.75, -2],
  [2.25, 0],
];
const STRUT_FOOT: readonly [number, number, number] = [0, 1.5, -1];

export const BAR_FLAT_RADIUS = 1.25;
export const BAR_HALF_LENGTH = 6;
/** The strut meets the bar this far ahead of the bar's middle, leaving the stretch behind it free for the hand. */
export const BAR_STRUT_X = 4;
/**
 * The strut's axis meets the bar's underside this far to the bar's inboard side of its centre line, so the strut's
 * sunk end lies wholly inside the bar's section instead of poking out of its outer face.
 */
export const BAR_STRUT_Z = 0.5;
/** The hand's room: from the bar's rear end to just behind the strut, and this far beyond the bar's surface all round. */
const HAND_FRONT_X = 3;
const HAND_CLEARANCE = 2;
const HAND_HALF_SPAN = BAR_FLAT_RADIUS + HAND_CLEARANCE;

const strutNormal = [0, STRUT_UP, -STRUT_LEFT] as const;

export const handleTrunnion: PartFamily = {
  name: 'handle-trunnion',
  params: {},
  build(): PartDef {
    const block: ExtrudedPolygonSolid = {
      id: 'block',
      kind: 'extruded-polygon',
      profile: TRUNNION_PROFILE,
      axis: 'x',
      z: [-TRUNNION_HALF_LENGTH, TRUNNION_HALF_LENGTH],
    };
    return {
      family: 'carry-handle',
      solids: [block],
      ports: [
        { id: 'base', mount: 'trunnion', gender: 'male', pos: [0, 0, 0], normal: Z, up: Y, required: true },
        { id: 'strut', mount: 'handle-strut', gender: 'female', pos: STRUT_FOOT, normal: strutNormal, up: X },
      ],
      keepOuts: [],
      axes: [],
    };
  },
};

export const handleStrut: PartFamily = {
  name: 'handle-strut',
  params: {},
  build(): PartDef {
    return {
      family: 'carry-handle',
      solids: [octagonPrism('strut', STRUT_FLAT_RADIUS, [-STRUT_SINK_BASE, STRUT_LENGTH + STRUT_SINK_TOP])],
      ports: [
        { id: 'base', mount: 'handle-strut', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
        // Tilted back by the strut's angle: the bar mounted here comes out level.
        {
          id: 'top',
          mount: 'handle-bar',
          gender: 'female',
          pos: [STRUT_LENGTH, 0, 0],
          normal: [STRUT_UP, 0, -STRUT_LEFT],
          up: Y,
        },
      ],
      keepOuts: [],
      axes: [],
    };
  },
};

export const handleBar: PartFamily = {
  name: 'handle-bar',
  params: {},
  build(): PartDef {
    const handRoom: KeepOut = {
      id: 'hand-room',
      kind: 'hand-room',
      box: boxFromMinMax(
        [-BAR_HALF_LENGTH, -HAND_HALF_SPAN, -HAND_HALF_SPAN],
        [HAND_FRONT_X, HAND_HALF_SPAN, HAND_HALF_SPAN],
      ),
    };
    return {
      family: 'carry-handle',
      solids: [octagonPrism('grip-bar', BAR_FLAT_RADIUS, [-BAR_HALF_LENGTH, BAR_HALF_LENGTH])],
      ports: [
        {
          id: 'base',
          mount: 'handle-bar',
          gender: 'male',
          pos: [BAR_STRUT_X, -BAR_FLAT_RADIUS, BAR_STRUT_Z],
          normal: NEG_Y,
          up: X,
          required: true,
        },
      ],
      keepOuts: [handRoom],
      axes: [],
    };
  },
};
