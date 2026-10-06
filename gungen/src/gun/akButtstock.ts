import type { SizeClass } from '../core/conventions.ts';
import type { Solid, Vec2 } from '../core/schema.ts';
import { AK_PROPORTIONS } from './akProportions.ts';
import { hermite, type StockContour, woodRegion } from './stockWood.ts';

const { receiver: R, stock: S } = AK_PROPORTIONS;

/** The comb's height at x, back from the receiver's rear face (x ≤ 0). */
export const akStockTop = (x: number): number => R.rearFaceTopU + S.topSlope * x;

/**
 * The AKM's wooden buttstock: a wedge with no wrist or grip of its own, whose front is the receiver's rear
 * face and whose butt ends in a steel buttplate.
 */
export const akButtstockSolids = (length: SizeClass): Solid[] => {
  const len = S.lengthU[length];
  const neckBottom = R.bottomU - S.neck.dropU;
  const belly = (x: number): number => neckBottom + S.bellySlope * (x - S.neck.x);
  const toeStart = -len + S.toeRoundU;
  const toe = belly(toeStart) - (S.bellySlope * S.toeRoundU) / 2;
  const bottom = (x: number): number => {
    if (x >= S.neck.x) {
      return hermite(x, [0, R.bottomU, S.neck.frontSlope], [S.neck.x, neckBottom, S.bellySlope]);
    }
    return x >= toeStart ? belly(x) : hermite(x, [toeStart, belly(toeStart), S.bellySlope], [-len, toe, 0]);
  };
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
    ...woodRegion(contour(4), 'stock-neck', [0, S.neck.x]),
    ...woodRegion(contour(1), 'stock-belly', [S.neck.x, toeStart]),
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
