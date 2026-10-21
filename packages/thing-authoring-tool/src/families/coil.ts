import type { Vec2 } from '@skelly/engine/shapes/solid.ts';
import { integer, parse, pipe, strictObject } from 'valibot';
import { positive, revolve } from './shapes.ts';

export const coil = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({ radius: positive, tubeRadius: positive, turns: pipe(positive, integer()), pitch: positive }),
    params,
  );
  if (d.radius <= d.tubeRadius) {
    throw new Error('Coil needs a central opening');
  }
  return Array.from({ length: d.turns }, (_, turn) => {
    const bottom = turn * d.pitch;
    const top = bottom + 2 * d.tubeRadius;
    const profile: Vec2[] = [
      [bottom, d.radius],
      [bottom + d.tubeRadius, d.radius + d.tubeRadius],
      [top, d.radius],
      [bottom + d.tubeRadius, d.radius - d.tubeRadius],
      [bottom, d.radius],
    ];
    return revolve(`turn-${turn}`, profile);
  });
};
