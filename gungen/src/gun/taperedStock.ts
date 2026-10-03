import { clipPolygon } from '../core/geometry.ts';
import type { Solid, Vec2 } from '../core/schema.ts';
import { TAPERED_STOCK_PROPORTIONS as P } from './shotgunProportions.ts';

/** Cubic Hermite graph, with endpoint slopes expressed as dy/dx. */
const curve = (x: number, a: readonly [number, number, number], b: readonly [number, number, number]): number => {
  const dx = b[0] - a[0];
  const t = (x - a[0]) / dx;
  return (
    (2 * t ** 3 - 3 * t ** 2 + 1) * a[1] +
    (t ** 3 - 2 * t ** 2 + t) * dx * a[2] +
    (-2 * t ** 3 + 3 * t ** 2) * b[1] +
    (t ** 3 - t ** 2) * dx * b[2]
  );
};
const combSlope = Math.tan((P.combDegrees * Math.PI) / 180);
const top = (x: number): number => {
  if (x >= P.gripX) {
    return curve(x, [0, P.combAtJointU, 0.4], [P.gripX, P.gripTopU, 0]);
  }
  if (x >= P.combCrestX) {
    return curve(x, [P.gripX, P.gripTopU, 0], [P.combCrestX, P.combCrestTopU, 0]);
  }
  const straight = P.combCrestTopU + combSlope * (x - P.combCrestX);
  return x >= P.combStartX
    ? curve(x, [P.combCrestX, P.combCrestTopU, 0], [P.combStartX, straight, combSlope])
    : straight;
};
const arcDx = P.wristStartX - P.throatEndX;
const arcDy = P.throatStartBottomU - P.throatEndBottomU;
const arcRadius = (arcDx ** 2 + arcDy ** 2) / (2 * arcDy);
const arc = (x: number): number =>
  P.throatStartBottomU - arcRadius + Math.sqrt(arcRadius ** 2 - (x - P.wristStartX) ** 2);
const arcEndSlope = arcDx / (arcRadius - arcDy);

/** Same GRIP/JOINT/COMB roles, partitioned into convex cells for collision; finish merges their internal faces. */
export const taperedStockSolids = ({ length, sawed }: { length: 'S' | 'M' | 'L'; sawed: boolean }): Solid[] => {
  const len = P.lengthU[length];
  const padLength = P.padLengthRatio * len;
  const height = P.buttHeightU[length];
  const rake = height * Math.tan((P.padPitchDegrees * Math.PI) / 180);
  const padTopX = -len + padLength;
  const padBottomX = padTopX + rake;
  const heel = top(padTopX);
  const toe = heel - height;
  const bellySlope = (P.neckBottomU - toe) / (P.combStartX - padBottomX);
  const bottom = (x: number): number => {
    if (x >= P.wristStartX) {
      return curve(x, [0, -2.5, 0], [P.wristStartX, P.throatStartBottomU, 0]);
    }
    if (x >= P.throatEndX) {
      return arc(x);
    }
    if (x >= P.gripX) {
      return curve(x, [P.throatEndX, P.throatEndBottomU, arcEndSlope], [P.gripX, P.gripBottomU, 0]);
    }
    return curve(x, [P.gripX, P.gripBottomU, 0], [P.combStartX, P.neckBottomU, bellySlope]);
  };
  const widths = P.halfWidthU;
  const bodyWidthSlope = (widths.butt - widths.joint) / (padTopX - P.combStartX);
  const halfWidth = (x: number): number => {
    if (x >= P.wristStartX) {
      return curve(x, [0, widths.connector, 0], [P.wristStartX, widths.wrist, 0]);
    }
    if (x >= P.wristX) {
      return widths.wrist;
    }
    if (x >= P.gripX) {
      return curve(x, [P.wristX, widths.wrist, 0], [P.gripX, widths.grip, 0]);
    }
    return curve(x, [P.gripX, widths.grip, 0], [P.combStartX, widths.joint, bodyWidthSlope]);
  };
  const wood = (
    id: string,
    role: string,
    profile: readonly Vec2[],
    width: readonly [number, number, number, number],
  ): Solid => {
    const [frontX, frontHalf, backX, backHalf] = width;
    const slope = (backHalf - frontHalf) / (backX - frontX);
    const offset = frontHalf - slope * frontX;
    const half = Math.max(frontHalf, backHalf);
    return {
      id,
      kind: 'extruded-polygon',
      profile,
      z: [-half, half],
      clip: [
        { normal: [-slope, 0, 1], offset },
        { normal: [-slope, 0, -1], offset },
      ],
      slot: 'furniture',
      display: { bevel: false, outline: false, outlineAngleDeg: 30, mergeGroup: 'tapered-stock-wood', role },
    };
  };
  const region = (role: string, [front, back]: readonly [number, number], breaks: readonly number[] = []): Solid[] => {
    const xs = [
      ...new Set([
        ...Array.from({ length: P.curveSegments + 1 }, (_, i) => front + ((back - front) * i) / P.curveSegments),
        ...breaks,
      ]),
    ].sort((a, b) => b - a);
    return xs.slice(1).map((x, i) =>
      wood(
        i === 0 ? role : `${role}-${i}`,
        role,
        [
          [x, bottom(x)],
          [xs[i]!, bottom(xs[i]!)],
          [xs[i]!, top(xs[i]!)],
          [x, top(x)],
        ],
        [xs[i]!, halfWidth(xs[i]!), x, halfWidth(x)],
      ),
    );
  };
  const hand = [
    ...region('fore-stock', [0, P.wristStartX]),
    ...region('stock-wrist', [P.wristStartX, P.wristX]),
    ...region('grip', [P.wristX, P.gripX], [P.throatEndX]),
  ];
  const joint = region('stock-joint', [P.gripX, P.combStartX], [P.combCrestX]);
  if (sawed) {
    const cut = P.gripX - 0.5;
    const stub = joint
      .filter((s) => s.kind === 'extruded-polygon' && Math.max(...s.profile.map((p) => p[0])) > cut)
      .map((s, i) => {
        if (s.kind !== 'extruded-polygon') {
          throw new Error('stock cells must be polygon extrusions');
        }
        const profile = clipPolygon(
          s.profile.map(([x, y]) => [x, y, 0]),
          { normal: [-1, 0, 0], offset: -cut },
          true,
        ).map(([x, y]): Vec2 => [x, y]);
        return {
          ...s,
          id: i === 0 ? 'cut-stub' : `cut-stub-${i}`,
          profile,
          display: { ...s.display, role: 'cut-stub' },
        };
      });
    return [...hand, ...stub];
  }
  return [
    ...hand,
    ...joint,
    wood(
      'stock-comb',
      'stock-comb',
      [
        [padBottomX, toe],
        [P.combStartX, P.neckBottomU],
        [P.combStartX, top(P.combStartX)],
        [padTopX, heel],
      ],
      [P.combStartX, widths.joint, padTopX, widths.butt],
    ),
    {
      id: 'butt-pad',
      kind: 'extruded-polygon',
      profile: [
        [-len + rake, toe],
        [padBottomX, toe],
        [padTopX, heel],
        [-len, heel],
      ],
      z: [-widths.butt, widths.butt],
      material: 'rubber-black',
      slot: 'accent',
    },
  ];
};
