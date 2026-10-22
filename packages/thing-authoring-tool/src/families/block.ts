import type { BoxSolid } from '@skelly/engine/shapes/solid.ts';
import { parse, strictObject } from 'valibot';
import { positive } from './shapes.ts';

/** One box standing on the origin, centred on x and z. */
export const block = (params: Readonly<Record<string, string>>): readonly BoxSolid[] => {
  const d = parse(strictObject({ width: positive, height: positive, depth: positive }), params);
  return [
    {
      id: 'body',
      kind: 'box',
      box: { center: [0, d.height / 2, 0], half: [d.width / 2, d.height / 2, d.depth / 2] },
      slot: 'body',
    },
  ];
};
