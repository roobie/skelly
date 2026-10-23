import type { ExtrudedPolygonSolid, Solid, Vec2 } from '@skelly/engine/shapes/solid.ts';
import { parse, strictObject } from 'valibot';
import { box, link, positive, round } from './shapes.ts';

/** A diamond of four links closed by a screw: the base plate sits low, the saddle rides the top corner. */
export const scissorJack = (params: Readonly<Record<string, string>>): readonly Solid[] => {
  const d = parse(
    strictObject({
      baseLength: positive,
      baseWidth: positive,
      baseThickness: positive,
      halfSpan: positive,
      halfHeight: positive,
      linkWidth: positive,
      linkDepth: positive,
      linkOffset: positive,
      screwRadius: positive,
      crankLength: positive,
      crankRadius: positive,
      saddleLength: positive,
      saddleWidth: positive,
      saddleThickness: positive,
    }),
    params,
  );
  if (d.linkOffset + d.linkDepth / 2 > d.baseWidth / 2) {
    throw new Error('Scissor jack links overhang the base');
  }
  const bottom: Vec2 = [0, d.baseThickness];
  const middle = d.baseThickness + d.halfHeight;
  const top: Vec2 = [0, d.baseThickness + 2 * d.halfHeight];
  const sides = [-1, 1].flatMap((sign) => {
    const at = (name: string, ends: readonly [Vec2, Vec2]) =>
      link(`${name}-${sign}`, ends, [d.linkWidth, d.linkDepth], 'link');
    const moved = (solid: ExtrudedPolygonSolid): ExtrudedPolygonSolid => ({
      ...solid,
      z: [solid.z[0] + sign * d.linkOffset, solid.z[1] + sign * d.linkOffset],
    });
    return [
      at('lower-left', [bottom, [-d.halfSpan, middle]]),
      at('lower-right', [bottom, [d.halfSpan, middle]]),
      at('upper-left', [[-d.halfSpan, middle], top]),
      at('upper-right', [[d.halfSpan, middle], top]),
    ].map(moved);
  });
  return [
    box('base', [0, d.baseThickness / 2, 0], [d.baseLength, d.baseThickness, d.baseWidth], 'frame'),
    ...sides,
    round('screw', [-d.halfSpan, middle, 0], [d.screwRadius, 2 * d.halfSpan], ['x', 'screw']),
    round('crank', [d.halfSpan, middle, 0], [d.crankRadius, d.crankLength], ['x', 'screw']),
    box('saddle', [0, top[1] + d.saddleThickness / 2, 0], [d.saddleLength, d.saddleThickness, d.saddleWidth], 'frame'),
  ];
};

/** A squat hydraulic body with a ram, a saddle disc and the socket a lever slides into. */
export const bottleJack = (params: Readonly<Record<string, string>>): readonly Solid[] => {
  const d = parse(
    strictObject({
      baseLength: positive,
      baseWidth: positive,
      baseThickness: positive,
      bodyRadius: positive,
      bodyHeight: positive,
      shoulderRadius: positive,
      shoulderHeight: positive,
      ramRadius: positive,
      ramHeight: positive,
      saddleRadius: positive,
      saddleThickness: positive,
      socketRadius: positive,
      socketLength: positive,
    }),
    params,
  );
  if (d.bodyRadius * 2 > Math.min(d.baseLength, d.baseWidth) || d.ramRadius >= d.shoulderRadius) {
    throw new Error('Invalid bottle jack dimensions');
  }
  const bodyTop = d.baseThickness + d.bodyHeight;
  const shoulderTop = bodyTop + d.shoulderHeight;
  const ramTop = shoulderTop + d.ramHeight;
  return [
    box('base', [0, d.baseThickness / 2, 0], [d.baseLength, d.baseThickness, d.baseWidth], 'frame'),
    round('body', [0, d.baseThickness, 0], [d.bodyRadius, d.bodyHeight], ['y', 'body']),
    round('shoulder', [0, bodyTop, 0], [d.shoulderRadius, d.shoulderHeight], ['y', 'body']),
    round('ram', [0, shoulderTop, 0], [d.ramRadius, d.ramHeight], ['y', 'ram']),
    round('saddle', [0, ramTop, 0], [d.saddleRadius, d.saddleThickness], ['y', 'frame']),
    round(
      'socket',
      [d.bodyRadius, d.baseThickness + d.bodyHeight * 0.35, 0],
      [d.socketRadius, d.socketLength],
      ['x', 'ram'],
    ),
  ];
};

/** A legged floor crane: two legs on casters, a mast, a boom braced by a hydraulic ram and a hanging hook. */
export const engineHoist = (params: Readonly<Record<string, string>>): readonly Solid[] => {
  const d = parse(
    strictObject({
      legLength: positive,
      legSpread: positive,
      legWidth: positive,
      legHeight: positive,
      mastHeight: positive,
      mastWidth: positive,
      boomReach: positive,
      boomRise: positive,
      boomWidth: positive,
      ramWidth: positive,
      ramFoot: positive,
      ramJoin: positive,
      casterRadius: positive,
      casterWidth: positive,
      chainLength: positive,
      chainWidth: positive,
      hookWidth: positive,
      hookHeight: positive,
    }),
    params,
  );
  if (d.ramJoin >= 1) {
    throw new Error('Invalid engine hoist dimensions');
  }
  const lift = d.casterRadius * 2;
  const legTop = lift + d.legHeight;
  const mastTop = legTop + d.mastHeight;
  const boomEnd: Vec2 = [d.boomReach, mastTop + d.boomRise];
  const boomPoint = (fraction: number): Vec2 => [fraction * boomEnd[0], mastTop + fraction * d.boomRise];
  const casterAt = (name: string, x: number, z: number) =>
    round(name, [x, d.casterRadius, z - d.casterWidth / 2], [d.casterRadius, d.casterWidth], ['z', 'caster']);
  const legs = [-1, 1].flatMap((sign) => {
    const z = (sign * d.legSpread) / 2;
    return [
      box(`leg-${sign}`, [d.legLength / 2, lift + d.legHeight / 2, z], [d.legLength, d.legHeight, d.legWidth], 'frame'),
      casterAt(`caster-front-${sign}`, d.legLength - d.casterRadius, z),
      casterAt(`caster-rear-${sign}`, d.casterRadius, z),
    ];
  });
  const hookY = boomEnd[1] - d.chainLength;
  return [
    ...legs,
    box('cross-brace', [d.mastWidth / 2, lift + d.legHeight / 2, 0], [d.mastWidth, d.legHeight, d.legSpread], 'frame'),
    box('mast', [d.mastWidth / 2, legTop + d.mastHeight / 2, 0], [d.mastWidth, d.mastHeight, d.mastWidth], 'frame'),
    link('boom', [[d.mastWidth / 2, mastTop], boomEnd], [d.boomWidth, d.mastWidth], 'boom'),
    link('ram', [[d.mastWidth, legTop + d.ramFoot], boomPoint(d.ramJoin)], [d.ramWidth, d.ramWidth], 'ram'),
    box('chain', [boomEnd[0], boomEnd[1] - d.chainLength / 2, 0], [d.chainWidth, d.chainLength, d.chainWidth], 'chain'),
    box('hook', [boomEnd[0], hookY - d.hookHeight / 2, 0], [d.hookWidth, d.hookHeight, d.hookWidth], 'boom'),
  ];
};
