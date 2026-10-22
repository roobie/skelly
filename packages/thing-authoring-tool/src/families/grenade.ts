import type { Vec2 } from '@skelly/engine/shapes/solid.ts';
import { parse, strictObject } from 'valibot';
import { cylinder, positive, revolve, strip } from './shapes.ts';

const SEGMENTS = 12;

export const grenade = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      radius: positive,
      height: positive,
      neckRadius: positive,
      neckHeight: positive,
      headRadius: positive,
      headHeight: positive,
      leverWidth: positive,
      leverThickness: positive,
      leverGap: positive,
      leverEndDegrees: positive,
      ringRadius: positive,
      ringTube: positive,
    }),
    params,
  );
  if (!(d.neckRadius < d.radius && d.headRadius >= d.neckRadius && d.ringTube < d.ringRadius)) {
    throw new Error('Invalid grenade dimensions');
  }
  const half = d.height / 2;
  const top = Math.PI - Math.asin(d.neckRadius / d.radius);
  const body: Vec2[] = Array.from({ length: SEGMENTS + 1 }, (_, i) => {
    const angle = (top * i) / SEGMENTS;
    return [half - half * Math.cos(angle), d.radius * Math.sin(angle)];
  });
  const [shoulder] = body.at(-1)!;
  const neckBase = shoulder - d.neckHeight / 4;
  const headBase = shoulder + d.neckHeight;
  const headTop = headBase + d.headHeight;

  // The lever rides the body's outward offset, measured as an angle from the top of the body.
  const offset = d.leverGap + d.leverThickness / 2;
  const alongBody = (fromTop: number): Vec2 => {
    const angle = Math.PI - fromTop;
    const normal = Math.hypot(half * Math.sin(angle), d.radius * Math.cos(angle));
    return [
      d.radius * Math.sin(angle) + (offset * half * Math.sin(angle)) / normal,
      half - half * Math.cos(angle) - (offset * d.radius * Math.cos(angle)) / normal,
    ];
  };
  const leverX = d.headRadius + offset;
  let [low, high] = [0, Math.PI / 2];
  while (high - low > 1e-6) {
    const mid = (low + high) / 2;
    [low, high] = alongBody(mid)[0] < leverX ? [mid, high] : [low, mid];
  }
  const end = (d.leverEndDegrees * Math.PI) / 180;
  const lever: Vec2[] = [
    [-d.headRadius / 2, headTop + d.leverThickness / 2],
    [leverX, headTop + d.leverThickness / 2],
    ...Array.from({ length: SEGMENTS + 1 }, (_, i) => alongBody(low + ((end - low) * i) / SEGMENTS)),
  ];

  const pinY = headBase + d.headHeight / 2;
  const pinEnd = d.headRadius + d.ringRadius / 2;
  const ringCentre = pinEnd + d.ringRadius - d.ringTube;
  return [
    revolve('body', [...body, [shoulder, 0]]),
    { ...cylinder('neck', d.neckRadius, headBase - neckBase, 'metal'), origin: [0, neckBase, 0] as const },
    { ...cylinder('head', d.headRadius, d.headHeight, 'metal'), origin: [0, headBase, 0] as const },
    ...strip('lever', lever, [d.leverThickness, d.leverWidth], 'metal'),
    {
      ...cylinder('pin', d.ringTube, pinEnd, 'metal'),
      axis: 'z' as const,
      origin: [0, pinY, 0] as const,
    },
    {
      ...revolve(
        'ring',
        [
          [-d.ringTube, d.ringRadius],
          [0, d.ringRadius + d.ringTube],
          [d.ringTube, d.ringRadius],
          [0, d.ringRadius - d.ringTube],
          [-d.ringTube, d.ringRadius],
        ],
        'metal',
      ),
      axis: 'x' as const,
      origin: [0, pinY, ringCentre] as const,
    },
  ];
};
