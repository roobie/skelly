import { parse, strictObject } from 'valibot';
import { annulus, positive } from './shapes.ts';

export const ring = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({ outerRadius: positive, innerRadius: positive, coreRadius: positive, height: positive }),
    params,
  );
  if (!(d.innerRadius < d.coreRadius && d.coreRadius < d.outerRadius)) {
    throw new Error('Ring radii must nest');
  }
  return [
    annulus('body', [d.coreRadius, d.outerRadius], d.height),
    annulus('core', [d.innerRadius, d.coreRadius], d.height, 'core'),
  ];
};
