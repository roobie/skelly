import { boxFromMinMax } from '@skelly/engine/core/geometry.ts';
import type {
  ExtrudedPolygonSolid,
  KeepOut,
  ParamSpec,
  PartDef,
  PartFamily,
  Vec2,
} from '@skelly/engine/core/schema.ts';
import { choice, NEG_X, NEG_Y, octagonPrism, X, Y, Z } from './common.ts';

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
const STRUT_FLAT_RADIUS = 0.75;
/** Direction cosines of the strut's axis against vertical (up) and sideways (left): a 4-3-5 triangle. */
export const STRUT_UP = 0.8;
export const STRUT_LEFT = 0.6;
export const STRUT_TILT_DEGREES = (Math.atan2(STRUT_LEFT, STRUT_UP) * 180) / Math.PI;
/** How far the strut's solid reaches past each port along its axis: into the trunnion, and into the bar. */
const STRUT_SINK_BASE = 0.5;
const STRUT_SINK_TOP = 0.625;

const TRUNNION_HALF_LENGTH = 2;

/**
 * The trunnion's section across the bore (profile axes Y, Z): the shroud wall at z = 0, the block reaching 2u out to
 * the left, symmetric about the bore's horizontal plane so it is the same in both poses. Each sloped face is the
 * plane through a strut port (1.5, -1) or (-1.5, -1) perpendicular to the strut's axis in that pose, so the strut
 * stands square on it: from the wall (2.25, 0) out to (0.75, -2) along the direction (0.6, 0.8), 1.25u either side of
 * the port (the carry pose's upper face, mirrored for the stowed pose's lower one). Counter-clockwise, convex.
 */
const TRUNNION_PROFILE: readonly Vec2[] = [
  [-2.25, 0],
  [-0.75, -2],
  [0.75, -2],
  [2.25, 0],
];
const POSES = ['carry', 'stowed'] as const;
/** +1 for the raised `carry` pose, -1 for the mirrored `stowed` pose: the sign of the strut's rise. */
const rise = (pose: string | undefined): 1 | -1 => (pose === 'stowed' ? -1 : 1);
/** The strut and the bar take the pose of whatever they are mounted on, so the design sets it on the trunnion only. */
const inheritedPose: ParamSpec = { values: POSES, default: 'carry', from: [{ port: 'base', param: 'pose' }] };

export const BAR_FLAT_RADIUS = 1.25;
export const BAR_HALF_LENGTH = 6;
/** The strut meets the bar this far ahead of the bar's middle, leaving the stretch behind it free for the hand. */
const BAR_STRUT_X = 4;
/**
 * The strut's axis meets the bar's underside this far to the bar's inboard side of its centre line, so the strut's
 * sunk end lies wholly inside the bar's section instead of poking out of its outer face.
 */
const BAR_STRUT_Z = 0.5;
/** The hand's room: from the bar's rear end to just behind the strut, and this far beyond the bar's surface all round. */
const HAND_FRONT_X = 3;
const HAND_CLEARANCE = 2;
const HAND_HALF_SPAN = BAR_FLAT_RADIUS + HAND_CLEARANCE;

export const handleTrunnion: PartFamily = {
  name: 'handle-trunnion',
  params: { pose: choice(...POSES) },
  build(params): PartDef {
    const sign = rise(params.pose);
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
        {
          id: 'strut',
          mount: 'handle-strut',
          gender: 'female',
          pos: [0, sign * 1.5, -1],
          normal: [0, sign * STRUT_UP, -STRUT_LEFT],
          up: X,
        },
      ],
      keepOuts: [],
      axes: [],
    };
  },
};

export const handleStrut: PartFamily = {
  name: 'handle-strut',
  params: { pose: inheritedPose },
  build(params): PartDef {
    return {
      family: 'carry-handle',
      solids: [octagonPrism('strut', STRUT_FLAT_RADIUS, [-STRUT_SINK_BASE, STRUT_LENGTH + STRUT_SINK_TOP])],
      ports: [
        { id: 'base', mount: 'handle-strut', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
        // Tilted back by the strut's angle: the bar mounted here comes out level. Stowed, the strut points down and
        // the bar must sit on its far side, so the port leans the other way (world normal down instead of up).
        {
          id: 'top',
          mount: 'handle-bar',
          gender: 'female',
          pos: [STRUT_LENGTH, 0, 0],
          normal: [STRUT_UP, 0, -rise(params.pose) * STRUT_LEFT],
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
  params: { pose: inheritedPose },
  build(params): PartDef {
    const sign = rise(params.pose);
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
          // Carried, the strut meets the bar's underside; stowed, its top.
          pos: [BAR_STRUT_X, -sign * BAR_FLAT_RADIUS, BAR_STRUT_Z],
          normal: sign > 0 ? NEG_Y : Y,
          up: X,
          required: true,
        },
      ],
      keepOuts: [handRoom],
      axes: [],
    };
  },
};
