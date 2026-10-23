import type { BoxSolid } from '@skelly/engine/shapes/solid.ts';
import { minValue, parse, pipe, strictObject } from 'valibot';
import { cylinder, positive, scalar } from './shapes.ts';

const nonnegative = pipe(scalar, minValue(0));
const box = (
  id: string,
  [width, height, depth]: readonly [number, number, number],
  center: readonly [number, number, number],
  slot: string,
): BoxSolid => ({ id, kind: 'box', box: { center, half: [width / 2, height / 2, depth / 2] }, slot });

export const bag = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      width: positive,
      height: positive,
      depth: positive,
      pocketHeight: positive,
      pocketDepth: positive,
      flapHeight: nonnegative,
      strapWidth: positive,
      handleHeight: nonnegative,
    }),
    params,
  );
  if (!(d.pocketHeight < d.height && 2 * d.strapWidth < d.width)) {
    throw new Error('Invalid bag dimensions');
  }
  const front = -d.depth / 2 - d.pocketDepth / 2;
  const solids = [
    box('body', [d.width, d.height, d.depth], [0, d.height / 2, 0], 'body'),
    box('front-pocket', [d.width * 0.76, d.pocketHeight, d.pocketDepth], [0, d.pocketHeight / 2, front], 'trim'),
    box(
      'left-strap',
      [d.strapWidth, d.height * 0.7, d.strapWidth],
      [-d.width * 0.29, d.height * 0.54, d.depth / 2],
      'trim',
    ),
    box(
      'right-strap',
      [d.strapWidth, d.height * 0.7, d.strapWidth],
      [d.width * 0.29, d.height * 0.54, d.depth / 2],
      'trim',
    ),
  ];
  if (d.flapHeight > 0) {
    solids.push(box('flap', [d.width * 0.8, d.flapHeight, d.pocketDepth * 1.15], [0, d.height * 0.72, front], 'trim'));
  }
  if (d.handleHeight > 0) {
    solids.push(
      box('handle', [d.width * 0.34, d.handleHeight, d.strapWidth], [0, d.height + d.handleHeight / 2, 0], 'trim'),
    );
  }
  return solids;
};

export const boots = (params: Readonly<Record<string, string>>) => {
  const d = parse(strictObject({ width: positive, height: positive, depth: positive, gap: nonnegative }), params);
  const bootWidth = (d.width - d.gap) / 2;
  if (bootWidth <= 0) {
    throw new Error('Boot gap exceeds width');
  }
  return [-1, 1].flatMap((side) => {
    const x = (side * (bootWidth + d.gap)) / 2;
    return [
      box(`sole-${side}`, [bootWidth, d.height * 0.13, d.depth], [x, d.height * 0.065, d.depth * 0.08], 'trim'),
      box(`toe-${side}`, [bootWidth, d.height * 0.42, d.depth * 0.58], [x, d.height * 0.34, -d.depth * 0.13], 'body'),
      box(
        `shaft-${side}`,
        [bootWidth * 0.76, d.height * 0.68, d.depth * 0.48],
        [x, d.height * 0.52, d.depth * 0.26],
        'body',
      ),
    ];
  });
};

export const cap = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({ radius: positive, height: positive, brimDepth: positive, brimWidth: positive }),
    params,
  );
  return [
    cylinder('body', d.radius, d.height, 'body'),
    box('brim', [d.brimWidth, d.height * 0.12, d.brimDepth], [0, d.height * 0.18, -d.radius], 'trim'),
  ];
};
