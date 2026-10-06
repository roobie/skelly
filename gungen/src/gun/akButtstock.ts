import type { SizeClass } from '../core/conventions.ts';
import type { Solid, Vec2 } from '../core/schema.ts';
import { AK_PROPORTIONS } from './akProportions.ts';
import { hermite, type StockContour, woodRegion } from './stockWood.ts';

const { receiver: R, stock: S } = AK_PROPORTIONS;

/** The stock's top at x, back from the receiver's rear face (x ≤ 0): shoulder, saddle, then the level comb. */
export const akStockTop = (x: number): number => {
  if (x >= S.saddle.x) {
    return hermite(x, [S.saddle.x, S.saddle.topU, 0], [0, R.rearFaceTopU, S.saddle.frontSlope]);
  }
  return x >= S.comb.x ? hermite(x, [S.comb.x, S.comb.topU, 0], [S.saddle.x, S.saddle.topU, 0]) : S.comb.topU;
};

/**
 * The AKM's wooden buttstock: a wedge with no wrist or grip of its own, whose front is the receiver's rear
 * face and whose butt ends in a steel buttplate.
 */
export const akButtstockSolids = (length: SizeClass): Solid[] => {
  const len = S.lengthU[length];
  const line = (x: number): number => R.bottomU + S.bottomSlope * x;
  const toeStart = -len + S.toeRoundU;
  const toe = line(toeStart) - (S.bottomSlope * S.toeRoundU) / 2;
  const bottom = (x: number): number =>
    x >= toeStart ? line(x) : hermite(x, [toeStart, line(toeStart), S.bottomSlope], [-len, toe, 0]);
  const halfWidth = (x: number): number => S.halfWidthU.front + ((S.halfWidthU.butt - S.halfWidthU.front) * x) / -len;
  const contour = (segments: number): StockContour => ({
    top: akStockTop,
    bottom,
    halfWidth,
    segments,
    mergeGroup: 'ak-stock-wood',
  });
  const heelX = -len + S.buttRakeU;
  const plateFrontX = heelX + S.buttplateU;
  const plate: readonly Vec2[] = [
    [-len, bottom(-len)],
    [plateFrontX, bottom(plateFrontX)],
    [plateFrontX, akStockTop(plateFrontX)],
    [heelX, akStockTop(heelX)],
  ];
  return [
    ...woodRegion(contour(5), 'stock-neck', [0, S.saddle.x]),
    ...woodRegion(contour(3), 'stock-saddle', [S.saddle.x, S.comb.x]),
    ...woodRegion(contour(1), 'stock-belly', [S.comb.x, toeStart]),
    ...woodRegion(contour(3), 'stock-toe', [toeStart, plateFrontX]),
    {
      id: 'buttplate',
      kind: 'extruded-polygon',
      profile: plate,
      z: [-halfWidth(-len), halfWidth(-len)],
      slot: 'metal',
    },
  ];
};
