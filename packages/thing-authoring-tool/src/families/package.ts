import type { BoxSolid } from '@skelly/engine/shapes/solid.ts';
import { minValue, parse, pipe, strictObject } from 'valibot';
import { cylinder, positive, revolve, scalar } from './shapes.ts';

const nonnegative = pipe(scalar, minValue(0));
const box = (
  id: string,
  [width, height, depth]: readonly [number, number, number],
  y: number,
  slot: string,
): BoxSolid => ({
  id,
  kind: 'box',
  box: { center: [0, y + height / 2, 0], half: [width / 2, height / 2, depth / 2] },
  slot,
});

export const carton = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      width: positive,
      height: positive,
      depth: positive,
      lidHeight: positive,
      bandHeight: positive,
      bandInset: positive,
      handleHeight: nonnegative,
      handleWidth: positive,
      handleDepth: positive,
      handleWall: positive,
    }),
    params,
  );
  if (!(d.lidHeight + d.bandHeight < d.height && d.bandInset < Math.min(d.width, d.depth) / 2)) {
    throw new Error('Invalid carton dimensions');
  }
  const solids: BoxSolid[] = [
    box('body', [d.width, d.height, d.depth], 0, 'body'),
    box('lid', [d.width, d.lidHeight, d.depth], d.height, 'cap'),
    box(
      'label',
      [d.width + 2 * d.bandInset, d.bandHeight, d.depth + 2 * d.bandInset],
      (d.height - d.bandHeight) / 2,
      'label',
    ),
  ];
  if (d.handleHeight > 0) {
    if (!(d.handleWidth < d.width && d.handleDepth <= d.depth && 2 * d.handleWall < d.handleWidth)) {
      throw new Error('Invalid carton handle');
    }
    for (const sign of [-1, 1]) {
      const post = box(
        `handle-post-${sign}`,
        [d.handleWall, d.handleHeight, d.handleDepth],
        d.height + d.lidHeight,
        'cap',
      );
      solids.push({
        ...post,
        box: { ...post.box, center: [(sign * (d.handleWidth - d.handleWall)) / 2, post.box.center[1], 0] },
      });
    }
    solids.push(
      box('handle', [d.handleWidth, d.handleWall, d.handleDepth], d.height + d.lidHeight + d.handleHeight, 'cap'),
    );
  }
  return solids;
};

export const vessel = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      radius: positive,
      height: positive,
      shoulderHeight: positive,
      neckRadius: positive,
      neckHeight: positive,
      capRadius: positive,
      capHeight: positive,
      rimHeight: positive,
      bandHeight: positive,
      bandInset: positive,
    }),
    params,
  );
  if (!(d.neckRadius <= d.radius && d.capRadius >= d.neckRadius && d.rimHeight + d.bandHeight < d.height)) {
    throw new Error('Invalid vessel dimensions');
  }
  const top = d.height + d.shoulderHeight + d.neckHeight;
  return [
    revolve('body', [
      [0, 0],
      [0, d.radius],
      [d.height, d.radius],
      [d.height + d.shoulderHeight, d.neckRadius],
      [top, d.neckRadius],
      [top, 0],
      [0, 0],
    ]),
    cylinder('rim', d.radius + d.bandInset, d.rimHeight, 'cap'),
    { ...cylinder('cap', d.capRadius, d.capHeight, 'cap'), origin: [0, top, 0] as const },
    {
      ...cylinder('label', d.radius + d.bandInset, d.bandHeight, 'label'),
      origin: [0, (d.height - d.bandHeight) / 2, 0] as const,
    },
  ];
};
