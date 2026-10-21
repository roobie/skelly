import type { Vec2 } from '@skelly/engine/shapes/solid.ts';
import { integer, parse, pipe, strictObject } from 'valibot';
import { annulus, cylinder, positive, revolve } from './shapes.ts';

export const spool = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      outerRadius: positive,
      coreRadius: positive,
      windingRadius: positive,
      height: positive,
      flangeHeight: positive,
      flangeInset: positive,
      windings: pipe(positive, integer()),
      grooveDepth: positive,
    }),
    params,
  );
  const woundHeight = d.height - 2 * (d.flangeHeight + d.flangeInset);
  if (!(d.coreRadius < d.windingRadius - d.grooveDepth && d.windingRadius < d.outerRadius && woundHeight > 0)) {
    throw new Error('Invalid spool dimensions');
  }
  const pitch = woundHeight / d.windings;
  const profile: Vec2[] = [
    [0, d.coreRadius],
    [0, d.windingRadius - d.grooveDepth],
  ];
  for (let i = 0; i < d.windings; i++) {
    profile.push(
      [pitch * (i + 0.25), d.windingRadius],
      [pitch * (i + 0.75), d.windingRadius],
      [pitch * (i + 1), d.windingRadius - d.grooveDepth],
    );
  }
  profile.push([woundHeight, d.coreRadius], [0, d.coreRadius]);
  return [
    cylinder('core', d.coreRadius, d.height, 'core'),
    {
      ...annulus('lower-flange', [d.coreRadius, d.outerRadius], d.flangeHeight, 'winding'),
      origin: [0, d.flangeInset, 0] as const,
    },
    { ...revolve('winding', profile, 'winding'), origin: [0, d.flangeInset + d.flangeHeight, 0] as const },
    {
      ...annulus('upper-flange', [d.coreRadius, d.outerRadius], d.flangeHeight, 'winding'),
      origin: [0, d.height - d.flangeInset - d.flangeHeight, 0] as const,
    },
  ];
};
