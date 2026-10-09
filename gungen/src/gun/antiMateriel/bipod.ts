import type { SizeClass } from '@skelly/engine/core/conventions.ts';
import { boxFromMinMax } from '@skelly/engine/core/geometry.ts';
import type { KeepOut, PartDef, PartFamily, Solid } from '@skelly/engine/core/schema.ts';
import { box, choice, cls, sizeParam, X, Y } from './common.ts';

/**
 * A folding bipod that hangs under the barrel shroud. Local origin is the mounting face (y = 0 touches the
 * shroud's underside, legs hang toward -Y). Legs are two plain bars; `legs` is the reach of a deployed leg
 * below the mount and `pose` picks which of the two states the model shows: folded (legs lie back along the
 * underside) or deployed (legs hang straight down, for a rifle resting on them).
 */
export const BIPOD_LEG_LENGTH: Readonly<Record<SizeClass, number>> = { S: 12, M: 18, L: 20 };
/** Deployed feet must reach this far below the lowest other part for the rifle to rest on them (see rules.ts). */
export const BIPOD_GROUND_CLEARANCE_U = 1;

const BLOCK_HALF_LENGTH = 1.5;
const BLOCK_HEIGHT = 1;
const LEG_Z: readonly [number, number] = [1.25, 2];
const LEG_THICKNESS = 1;
const FOOT_THICKNESS = 0.5;
const FOOT_HALF_LENGTH = 1.25;
const FOOT_FLARE = 0.25;
const SWEEP_HALF_WIDTH = 2.25;

/** Both legs in one pose, mirrored about the bore plane. */
const legs = (pose: string | undefined, reach: number): Solid[] =>
  ([-1, 1] as const).flatMap((side) => {
    const [z0, z1] = side > 0 ? LEG_Z : ([-LEG_Z[1], -LEG_Z[0]] as const);
    const name = side > 0 ? 'right' : 'left';
    if (pose === 'deployed') {
      return [
        box(`leg-${name}`, [-LEG_THICKNESS / 2, FOOT_THICKNESS - reach, z0], [LEG_THICKNESS / 2, -BLOCK_HEIGHT, z1]),
        box(
          `foot-${name}`,
          [-FOOT_HALF_LENGTH, -reach, z0 - FOOT_FLARE],
          [FOOT_HALF_LENGTH, FOOT_THICKNESS - reach, z1 + FOOT_FLARE],
        ),
      ];
    }
    const top = -BLOCK_HEIGHT;
    return [
      box(`leg-${name}`, [FOOT_THICKNESS - reach, top - LEG_THICKNESS, z0], [-LEG_THICKNESS / 2, top, z1]),
      box(
        `foot-${name}`,
        [-reach, top - LEG_THICKNESS - FOOT_FLARE, z0 - FOOT_FLARE],
        [FOOT_THICKNESS - reach, top + FOOT_FLARE, z1 + FOOT_FLARE],
      ),
    ];
  });

export const bipod: PartFamily = {
  name: 'bipod',
  params: { legs: sizeParam, pose: choice('folded', 'deployed') },
  build(params): PartDef {
    const reach = BIPOD_LEG_LENGTH[cls(params, 'legs')];
    // The legs swing from folded to deployed through the space under the mount; nothing else may sit there.
    const sweep: KeepOut = {
      id: 'leg-sweep',
      kind: 'leg-sweep',
      box: boxFromMinMax([-reach, -reach, -SWEEP_HALF_WIDTH], [BLOCK_HALF_LENGTH, -BLOCK_HEIGHT, SWEEP_HALF_WIDTH]),
    };
    return {
      family: 'bipod',
      solids: [
        box('mount-block', [-BLOCK_HALF_LENGTH, -BLOCK_HEIGHT, -LEG_Z[1]], [BLOCK_HALF_LENGTH, 0, LEG_Z[1]]),
        ...legs(params.pose, reach),
      ],
      ports: [{ id: 'base', mount: 'bipod', gender: 'male', pos: [0, 0, 0], normal: Y, up: X, required: true }],
      keepOuts: [sweep],
      axes: [],
    };
  },
};
