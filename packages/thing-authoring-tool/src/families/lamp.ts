import type { ExtrudedPolygonSolid, Vec2 } from '@skelly/engine/shapes/solid.ts';
import { parse, strictObject } from 'valibot';
import { cylinder, positive, revolve, scalar } from './shapes.ts';

export const base = (params: Readonly<Record<string, string>>) => {
  const d = parse(strictObject({ radius: positive, height: positive }), params);
  return [cylinder('body', d.radius, d.height)];
};
export const arm = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({ elbowX: scalar, elbowY: positive, endX: scalar, endY: positive, width: positive, depth: positive }),
    params,
  );
  const points: Vec2[] = [
    [0, 0],
    [d.elbowX, d.elbowY],
    [d.endX, d.endY],
  ];
  return points.slice(1).map((end, i): ExtrudedPolygonSolid => {
    const start = points[i]!;
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length === 0) {
      throw new Error('Arm segment needs length');
    }
    const dx = ((-(end[1] - start[1]) / length) * d.width) / 2;
    const dy = (((end[0] - start[0]) / length) * d.width) / 2;
    return {
      id: `segment-${i}`,
      kind: 'extruded-polygon',
      profile: [
        [start[0] + dx, start[1] + dy],
        [start[0] - dx, start[1] - dy],
        [end[0] - dx, end[1] - dy],
        [end[0] + dx, end[1] + dy],
      ],
      z: [-d.depth / 2, d.depth / 2],
      slot: 'body',
    };
  });
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
