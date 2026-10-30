import { parse, strictObject } from 'valibot';
import { annulus, cylinder, positive, revolve, scalar, strip } from './shapes.ts';

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
export const reservoir = (params: Readonly<Record<string, string>>) => {
  const d = parse(strictObject({ innerRadius: positive, outerRadius: positive, height: positive }), params);
  if (!(d.innerRadius < d.outerRadius)) {
    throw new Error('Reservoir needs a glass wall');
  }
  return [annulus('shell', [d.innerRadius, d.outerRadius], d.height, 'glass')];
};

export const chimney = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({ lowerRadius: positive, upperRadius: positive, height: positive, wall: positive }),
    params,
  );
  if (!(d.wall < Math.min(d.lowerRadius, d.upperRadius))) {
    throw new Error('Chimney wall closes its opening');
  }
  return [
    revolve(
      'glass',
      [
        [0, d.lowerRadius - d.wall],
        [0, d.lowerRadius],
        [d.height, d.upperRadius],
        [d.height, d.upperRadius - d.wall],
        [0, d.lowerRadius - d.wall],
      ],
      'glass',
    ),
  ];
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
