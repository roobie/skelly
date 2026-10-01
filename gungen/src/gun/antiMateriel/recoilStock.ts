import type { PartDef, PartFamily } from '../../core/schema.ts';
import { box, choice, NEG_Y, RUBBER, X, Y } from './common.ts';

/**
 * A straight stock for a heavy rifle: a tall body in line with the bore, a cheek rest, and a wide, flat
 * recoil pad. It is its own family (role `stock`) rather than a `stock` style because it carries a mount
 * for a rear monopod under the butt, which the shared stock has no port for. The grip is separate, so the
 * stock is not tagged as a firing grip.
 */
export const RECOIL_STOCK_LENGTH: Readonly<Record<string, number>> = { M: 16, L: 22 };

const BODY_TOP = 2.5;
const BODY_BOTTOM = -3;
const BODY_HALF_WIDTH = 1.5;
const CHEEK_START = 4;
const CHEEK_LENGTH = 6;
const CHEEK_HEIGHT = 0.75;
const CHEEK_HALF_WIDTH = 1.25;
const PAD_THICKNESS = 1.5;
const PAD_TOP = 3.5;
const PAD_BOTTOM = -8;
const PAD_HALF_WIDTH = 3;
/** The monopod mounts on the underside this far ahead of the pad. */
const MONOPOD_SETBACK = 2;

export const recoilStock: PartFamily = {
  name: 'recoil-stock',
  params: { length: choice('M', 'L') },
  build(params): PartDef {
    const length = RECOIL_STOCK_LENGTH[params.length ?? 'M']!;
    return {
      family: 'stock',
      solids: [
        box('body', [-length, BODY_BOTTOM, -BODY_HALF_WIDTH], [0, BODY_TOP, BODY_HALF_WIDTH]),
        box(
          'cheek-rest',
          [-length + CHEEK_START, BODY_TOP, -CHEEK_HALF_WIDTH],
          [-length + CHEEK_START + CHEEK_LENGTH, BODY_TOP + CHEEK_HEIGHT, CHEEK_HALF_WIDTH],
        ),
        box(
          'recoil-pad',
          [-length - PAD_THICKNESS, PAD_BOTTOM, -PAD_HALF_WIDTH],
          [-length, PAD_TOP, PAD_HALF_WIDTH],
          RUBBER,
        ),
      ],
      ports: [
        { id: 'front', mount: 'stock', gender: 'male', pos: [0, 0, 0], normal: X, up: Y, required: true },
        {
          id: 'monopod',
          mount: 'monopod',
          gender: 'female',
          pos: [-length + MONOPOD_SETBACK, BODY_BOTTOM, 0],
          normal: NEG_Y,
          up: X,
        },
      ],
      keepOuts: [],
      axes: [],
    };
  },
};
