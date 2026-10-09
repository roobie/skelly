import type { PartDef, PartFamily } from '@skelly/engine/core/schema.ts';
import { box, choice, X, Y } from './common.ts';

/**
 * A rear monopod under the butt. Local origin is the mounting face (y = 0 touches the stock's underside).
 * `pose` is folded (a short stub tucked under the stock) or deployed (a post that reaches below the pad).
 */
const MONOPOD_REACH = { folded: 2.5, deployed: 8 } as const;

const COLLAR_HALF = 1;
const COLLAR_HEIGHT = 1;
const POST_HALF = 0.5;
const FOOT_THICKNESS = 0.5;

export const monopod: PartFamily = {
  name: 'monopod',
  params: { pose: choice('folded', 'deployed') },
  build(params): PartDef {
    const reach = params.pose === 'deployed' ? MONOPOD_REACH.deployed : MONOPOD_REACH.folded;
    return {
      family: 'monopod',
      solids: [
        box('collar', [-COLLAR_HALF, -COLLAR_HEIGHT, -COLLAR_HALF], [COLLAR_HALF, 0, COLLAR_HALF]),
        box('post', [-POST_HALF, FOOT_THICKNESS - reach, -POST_HALF], [POST_HALF, -COLLAR_HEIGHT, POST_HALF]),
        box('foot', [-COLLAR_HALF, -reach, -COLLAR_HALF], [COLLAR_HALF, FOOT_THICKNESS - reach, COLLAR_HALF]),
      ],
      ports: [{ id: 'base', mount: 'monopod', gender: 'male', pos: [0, 0, 0], normal: Y, up: X, required: true }],
      keepOuts: [],
      axes: [],
    };
  },
};
