import type { Vec3 } from '@skelly/engine/foundation/math.ts';
import { boxFromMinMax, clipPolygon, validateExtrudedPolygon } from '@skelly/engine/shapes/geometry.ts';
import type { Box, Solid, Vec2 } from '@skelly/engine/shapes/solid.ts';
import type { ClosedTriggerGuardDimensions, TriggerBladeShape, TriggerGuardDimensions } from './triggerGuards.ts';

export const OPEN_TRIGGER_GUARD = 'trigger-guard-open-rear';
/** Every trigger blade's solid id is this, or this plus a segment index. */
export const TRIGGER_BLADE_ID = 'trigger-blade';
export const isTriggerBlade = (id: string): boolean => id === TRIGGER_BLADE_ID || id.startsWith(`${TRIGGER_BLADE_ID}-`);

/** A trigger blade in the finger space, hanging from `topY`: the guard's top bar or the receiver that closes it. */
export const triggerBlade = (finger: Box, shape: TriggerBladeShape, topY: number): Solid => {
  const rearX = finger.center[0] - finger.half[0];
  const bottomY = finger.center[1] - finger.half[1];
  const profile: Vec2[] = [
    ...shape.lower.map(([x, y]): Vec2 => [rearX + x, bottomY + y]),
    ...shape.topX.map((x): Vec2 => [rearX + x, topY]),
  ];
  const z: readonly [number, number] = [-shape.halfWidthU, shape.halfWidthU];
  const error = validateExtrudedPolygon(profile, z);
  if (error) {
    throw new Error(`Trigger blade: ${error}`);
  }
  return { id: TRIGGER_BLADE_ID, kind: 'extruded-polygon', profile, z };
};

export const openTriggerGuard = (
  finger: Box,
  dimensions: TriggerGuardDimensions,
  ceilingY: number,
  face: { xAt: (y: number) => number; straightTopY: number },
): { solids: Solid[]; tags: string[] } => {
  const topY = finger.center[1] - finger.half[1];
  const bottomY = topY - dimensions.wallU;
  const rearX = finger.center[0] - finger.half[0] - dimensions.clearanceU;
  const innerFrontX = finger.center[0] + finger.half[0] + dimensions.clearanceU;
  const frontX = innerFrontX + (dimensions.frontWallU ?? dimensions.wallU);
  const z: readonly [number, number] = [
    finger.center[2] - dimensions.halfWidthU,
    finger.center[2] + dimensions.halfWidthU,
  ];
  const slope = Math.tan((dimensions.rearSlantDegrees * Math.PI) / 180);
  const faceSlope = face.xAt(topY) - face.xAt(topY - 1);
  const meetY = (bottomY + slope * (rearX - face.xAt(topY) + faceSlope * topY)) / (1 + slope * faceSlope);
  const cutRun = dimensions.frontCutU / Math.tan((dimensions.frontCutDegrees * Math.PI) / 180);
  if (finger.center[1] + finger.half[1] > ceilingY) {
    throw new Error('Trigger finger must not reach above the receiver ceiling.');
  }
  if (topY > face.straightTopY || meetY > face.straightTopY) {
    throw new Error('Trigger corner exceeds the straight grip face.');
  }
  if (!(meetY > bottomY && meetY < topY && face.xAt(topY) < rearX)) {
    throw new Error('Trigger corner slant is too steep or does not reach the grip.');
  }
  if (dimensions.frontCutU > dimensions.wallU || cutRun >= frontX - rearX) {
    throw new Error('Trigger front cut exceeds the bar.');
  }
  const polygon = (name: string, profile: Vec2[]): Solid => {
    const error = validateExtrudedPolygon(profile, z);
    if (error) {
      throw new Error(`Trigger guard ${name}: ${error}`);
    }
    return {
      id: `trigger-guard-${name}`,
      kind: 'extruded-polygon',
      profile,
      z,
      display: { bevel: false, outline: false, mergeGroup: 'trigger-guard' },
    };
  };
  return {
    tags: [OPEN_TRIGGER_GUARD],
    solids: [
      {
        id: 'trigger-guard-front',
        kind: 'box',
        box: boxFromMinMax([innerFrontX, topY, z[0]], [frontX, ceilingY, z[1]]),
      },
      polygon('bottom', [
        [rearX, bottomY],
        [frontX - cutRun, bottomY],
        [frontX, bottomY + dimensions.frontCutU],
        ...(dimensions.frontCutU < dimensions.wallU ? [[frontX, topY] as Vec2] : []),
        [rearX, topY],
      ]),
      polygon('corner', [
        [rearX, bottomY],
        [rearX, topY],
        [face.xAt(topY), topY],
        [face.xAt(meetY), meetY],
      ]),
    ],
  };
};

/**
 * A closed loop with a straight rear, a flat bottom and a front ramp leaning forward up to the receiver, partitioned
 * into the four logical walls of a box guard. The ramp's foot keeps the finger's clearance.
 */
export const rampedTriggerGuardSolids = (finger: Box, dimensions: ClosedTriggerGuardDimensions): Solid[] => {
  const rearInnerX = finger.center[0] - finger.half[0] - dimensions.clearanceU;
  const rearX = rearInnerX - dimensions.rearWallU;
  const footX = finger.center[0] + finger.half[0] + dimensions.clearanceU;
  const minY = finger.center[1] - finger.half[1];
  const maxY = finger.center[1] + finger.half[1];
  const [bottomY, topY] = [minY - dimensions.wallU, maxY + dimensions.wallU];
  const a = (dimensions.frontRampDegrees * Math.PI) / 180;
  const run = (topY - bottomY) / Math.tan(a);
  const thickness = dimensions.wallU / Math.sin(a);
  const outline: Vec3[] = [
    [rearX, bottomY, 0],
    [footX + thickness, bottomY, 0],
    [footX + run + thickness, topY, 0],
    [rearX, topY, 0],
  ];
  const ramp = {
    normal: [-Math.sin(a), Math.cos(a), 0] as const,
    offset: -Math.sin(a) * footX + Math.cos(a) * bottomY,
  };
  const clip = (profile: readonly Vec3[], normal: readonly [number, number, number], offset: number) =>
    clipPolygon(profile, { normal, offset }, true, 1e-9);
  const behind = clip(outline, [-ramp.normal[0], -ramp.normal[1], 0], -ramp.offset);
  const middle = clip(clip(behind, [0, -1, 0], -minY), [0, 1, 0], maxY);
  const z: readonly [number, number] = [
    finger.center[2] - dimensions.halfWidthU,
    finger.center[2] + dimensions.halfWidthU,
  ];
  const walls: readonly [string, readonly Vec3[]][] = [
    ['top', clip(behind, [0, -1, 0], -maxY)],
    ['rear', clip(middle, [1, 0, 0], rearInnerX)],
    ['front', clip(outline, ramp.normal, ramp.offset)],
    ['bottom', clip(behind, [0, 1, 0], minY)],
  ];
  return walls.map(([name, profile]) => {
    const points = profile.map(([x, y]): Vec2 => [x, y]);
    const error = validateExtrudedPolygon(points, z);
    if (error) {
      throw new Error(`Trigger guard ${name}: ${error}`);
    }
    return {
      id: `trigger-guard-${name}`,
      kind: 'extruded-polygon',
      profile: points,
      z,
      display: { bevel: false, outline: false, mergeGroup: 'trigger-guard' },
    };
  });
};

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
