import type { RevolvedSolid, Solid } from '@skelly/engine/shapes/solid.ts';
import { parse, strictObject } from 'valibot';
import { cylinder, positive, revolve } from './shapes.ts';

// Long side along x: the upright hold stands the burning end up.
const alongX = (solid: RevolvedSolid, at = 0): RevolvedSolid => ({ ...solid, axis: 'x', origin: [at, 0, 0] });

export const torch = (params: Readonly<Record<string, string>>): readonly Solid[] => {
  const d = parse(
    strictObject({ length: positive, shaftRadius: positive, headLength: positive, headRadius: positive }),
    params,
  );
  if (!(d.headLength < d.length && d.shaftRadius < d.headRadius)) {
    throw new Error('A torch head must fit its length and wrap its shaft');
  }
  const start = d.length - d.headLength;
  return [
    alongX(cylinder('shaft', d.shaftRadius, start + d.headLength / 2, 'shaft')),
    alongX(
      revolve(
        'head',
        [
          [0, 0],
          [0, d.shaftRadius],
          [d.headLength * 0.2, d.headRadius],
          [d.headLength * 0.75, d.headRadius],
          [d.headLength, d.headRadius * 0.6],
          [d.headLength, 0],
          [0, 0],
        ],
        'head',
      ),
      start,
    ),
  ];
};

// The lens end faces +x, where the beam starts; the tail cap sits at the origin.
export const flashlight = (params: Readonly<Record<string, string>>): readonly Solid[] => {
  const d = parse(
    strictObject({
      length: positive,
      bodyRadius: positive,
      headRadius: positive,
      headLength: positive,
      lensDepth: positive,
    }),
    params,
  );
  if (!(d.bodyRadius < d.headRadius && d.headLength + d.lensDepth < d.length)) {
    throw new Error('A flashlight head must be wider than its body and fit its length');
  }
  const headAt = d.length - d.headLength - d.lensDepth;
  return [
    alongX(
      revolve(
        'body',
        [
          [0, 0],
          [0, d.bodyRadius * 0.9],
          [d.length * 0.05, d.bodyRadius],
          [headAt, d.bodyRadius],
          [headAt + d.headLength, d.headRadius],
          [headAt + d.headLength, 0],
          [0, 0],
        ],
        'body',
      ),
    ),
    alongX(cylinder('lens', d.headRadius * 0.9, d.lensDepth, 'lens'), d.length - d.lensDepth),
  ];
};

export const candle = (params: Readonly<Record<string, string>>): readonly Solid[] => {
  const d = parse(
    strictObject({ radius: positive, height: positive, wickRadius: positive, wickHeight: positive }),
    params,
  );
  if (!(d.wickRadius < d.radius)) {
    throw new Error('A candle wick must be thinner than its body');
  }
  return [
    alongX(
      revolve('body', [
        [0, 0],
        [0, d.radius],
        [d.height * 0.97, d.radius],
        [d.height, d.radius * 0.85],
        [d.height, 0],
        [0, 0],
      ]),
    ),
    alongX(cylinder('wick', d.wickRadius, d.wickHeight, 'wick'), d.height),
  ];
};
