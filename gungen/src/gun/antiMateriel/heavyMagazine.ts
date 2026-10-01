import type { PartDef, PartFamily } from '../../core/schema.ts';
import { BMG_BASE_DIAMETER_U, BMG_OVERALL_LENGTH_U, ceilTo } from './cartridge.ts';
import { box, RUBBER, X, Y } from './common.ts';

/**
 * A 10-round .50 BMG box magazine, sized from the cartridge rather than picked from the shared `magazine`
 * family's rifle-cartridge bands. The rounds lie along the bore, so the magazine is as deep (X) as the round is
 * long, and it is a close-packed double column, so it is short (Y) and wide (Z):
 *
 * - depth: round length plus 0.25u of wall at each end, up to the 0.5u the symmetric box needs to stay on the grid;
 * - width: the two columns' centres are offset by sqrt(3)/2 of a case diameter (neighbours in opposite columns
 *   touch), plus 0.25u walls, up to the next 0.5u;
 * - length: ten rounds in that zig-zag stand (10 - 1) * d/2 + d tall, plus 0.75u for the follower, spring and
 *   floorplate, up to the next 0.25u.
 *
 * It plays the `magazine` role, so the lower's `magazine` mount, the feed rule and the palette treat it as one.
 */
export const HEAVY_MAGAZINE_ROUNDS = 10;
const WALL = 0.25;
const BASE_ALLOWANCE = 0.75;

export const HEAVY_MAGAZINE_DEPTH = ceilTo(BMG_OVERALL_LENGTH_U + 2 * WALL, 0.5);
export const HEAVY_MAGAZINE_WIDTH = ceilTo(BMG_BASE_DIAMETER_U * (1 + Math.sqrt(3) / 2) + 2 * WALL, 0.5);
export const HEAVY_MAGAZINE_LENGTH = ceilTo(
  ((HEAVY_MAGAZINE_ROUNDS - 1) / 2 + 1) * BMG_BASE_DIAMETER_U + BASE_ALLOWANCE,
  0.25,
);
/** How far the magazine's top stands up into the well; the well's roof is one grid step above it. */
export const HEAVY_MAGAZINE_INSERTION = 0.75;
const FLOORPLATE_THICKNESS = 0.25;

export const heavyMagazine: PartFamily = {
  name: 'heavy-magazine',
  params: {},
  build(): PartDef {
    const bottom = HEAVY_MAGAZINE_INSERTION - HEAVY_MAGAZINE_LENGTH;
    const halfDepth = HEAVY_MAGAZINE_DEPTH / 2;
    const halfWidth = HEAVY_MAGAZINE_WIDTH / 2;
    return {
      family: 'magazine',
      solids: [
        box('body', [-halfDepth, bottom, -halfWidth], [halfDepth, HEAVY_MAGAZINE_INSERTION, halfWidth]),
        box(
          'floorplate',
          [-halfDepth, bottom, -halfWidth - WALL],
          [halfDepth + WALL, bottom + FLOORPLATE_THICKNESS, halfWidth + WALL],
          RUBBER,
        ),
      ],
      ports: [
        {
          id: 'top',
          mount: 'magazine',
          gender: 'male',
          pos: [0, 0, 0],
          normal: Y,
          up: X,
          required: true,
          seat: 'well',
        },
      ],
      keepOuts: [],
      axes: [],
    };
  },
};
