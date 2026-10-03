import { clipPolygon } from '../core/geometry.ts';
import type { Box, Solid, Vec2 } from '../core/schema.ts';

/** A faceted rounded loop, partitioned into the same four logical walls as a box guard. */
export const roundedTriggerGuardSolids = (
  finger: Box,
  {
    x: [rearX, frontX],
    y: [bottomY, topY],
    innerX: [innerRear, innerFront],
    z,
    corner,
  }: {
    x: readonly [number, number];
    y: readonly [number, number];
    innerX: readonly [number, number];
    z: readonly [number, number];
    corner: number;
  },
): Solid[] => {
  const outline: readonly Vec2[] = [
    [rearX + corner, bottomY],
    [frontX - corner, bottomY],
    [frontX, bottomY + corner],
    [frontX, topY - corner],
    [frontX - corner, topY],
    [rearX + corner, topY],
    [rearX, topY - corner],
    [rearX, bottomY + corner],
  ];
  const band = (profile: readonly Vec2[], axis: 0 | 1, edge: number, less: boolean): Vec2[] => {
    const normal = axis === 0 ? ([less ? 1 : -1, 0, 0] as const) : ([0, less ? 1 : -1, 0] as const);
    return clipPolygon(
      profile.map(([x, y]) => [x, y, 0]),
      { normal, offset: less ? edge : -edge },
      true,
      1e-9,
    ).map(([x, y]) => [x, y]);
  };
  const minY = finger.center[1] - finger.half[1];
  const maxY = finger.center[1] + finger.half[1];
  const middle = band(band(outline, 1, minY, false), 1, maxY, true);
  const walls: readonly [string, readonly Vec2[]][] = [
    ['top', band(outline, 1, maxY, false)],
    ['rear', band(middle, 0, innerRear, true)],
    ['front', band(middle, 0, innerFront, false)],
    ['bottom', band(outline, 1, minY, true)],
  ];
  return walls.map(([name, profile]) => ({
    id: `trigger-guard-${name}`,
    kind: 'extruded-polygon',
    profile,
    z,
    display: { bevel: false, outline: false, mergeGroup: 'trigger-guard' },
  }));
};
