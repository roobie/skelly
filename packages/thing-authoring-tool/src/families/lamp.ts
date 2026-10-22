import { parse, strictObject } from 'valibot';
import { cylinder, positive, revolve, scalar, strip } from './shapes.ts';

export const base = (params: Readonly<Record<string, string>>) => {
  const d = parse(strictObject({ radius: positive, height: positive }), params);
  return [cylinder('body', d.radius, d.height)];
};
export const arm = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({ elbowX: scalar, elbowY: positive, endX: scalar, endY: positive, width: positive, depth: positive }),
    params,
  );
  return strip(
    'segment',
    [
      [0, 0],
      [d.elbowX, d.elbowY],
      [d.endX, d.endY],
    ],
    [d.width, d.depth],
  );
};
export const shade = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({ bottomRadius: positive, topRadius: positive, height: positive, wall: positive }),
    params,
  );
  if (d.wall >= Math.min(d.topRadius, d.bottomRadius)) {
    throw new Error('Shade wall closes its opening');
  }
  return [
    revolve('body', [
      [0, d.bottomRadius - d.wall],
      [0, d.bottomRadius],
      [d.height, d.topRadius],
      [d.height, d.topRadius - d.wall],
      [0, d.bottomRadius - d.wall],
    ]),
  ];
};
